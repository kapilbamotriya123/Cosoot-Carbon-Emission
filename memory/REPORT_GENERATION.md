# Report Generation — Persistent Context

## What Are These Reports?
EU CBAM (Carbon Border Adjustment Mechanism) quarterly Excel reports. Our manufacturing clients (Meta Engitech, Shakambhari) send these to their European customers. The template is `lib/reports/templates/Report Sample ALTA.xlsx` (19 sheets, EU CBAM format). We fill specific "input" cells — the rest auto-calculate via Excel formulas.

## Template Location
`lib/reports/templates/Report Sample ALTA.xlsx` (moved from project root)

## Dump Scripts
Use to inspect any sheet before implementing its filler:
```
node scripts/dump-excel-clean.mjs "lib/reports/templates/Report Sample ALTA.xlsx" "SheetName"
```
Outputs a text file identifying FILL_IN cells (yellow background = FFFFFF00 or FFFFFFCC).
Previously generated dumps:
- `Report Sample ALTA_DUMP.txt` — full dump (9102 lines)
- `Report Sample ALTA_A_InstData.txt` — A_InstData sheet only

## Architecture

### File Structure
```
lib/reports/
  types.ts              -- All interfaces: ReportContext, SheetFiller, CompanyProfile, etc.
  pipeline.ts           -- Runner: load template → build context → run fillers → return Buffer
  template.ts           -- loadTemplate(), getSheet(), setCellValue(), setRowRange()
  company-data.ts       -- Static company profiles (hardcoded for 2 companies)
  fillers/
    index.ts            -- FILLER_REGISTRY (ordered array of FillerRegistration)
    a-inst-data.ts      -- ✅ DONE: A_InstData sheet filler
    [future fillers]    -- Add one file per sheet

app/api/reports/generate/route.ts  -- POST endpoint
```

### API Endpoint
`POST /api/reports/generate`
Body: `{ companySlug: string, year: number, quarter: number }`
Response: `{ success: true, fileName, fileUrl (gs://), downloadUrl (signed), sheetsProcessed }`

Flow: generate → upload to GCS (`reports/{slug}/{date}_{fileName}`) → log in `file_uploads` (upload_type = "report") → return signed URL

### Key Patterns
- `SheetFiller = (ctx: ReportContext) => void | Promise<void>`
- `ReportContext` = shared data bag (workbook + companyProfile + period + future DB data)
- Fail-fast: any filler throws → pipeline aborts entirely
- `setRowRange(sheet, "I", "N", rowNum, value)` — used heavily because A_InstData FILL_IN cells span I:N
- `setCellValue()` warns if accidentally overwriting a formula cell

## Sheets Status

### ✅ A_InstData — DONE
Fills: reporting period dates, company info (name/address/contact), goods categories, production processes, purchased precursors.

Data source: Static `CompanyProfile` in `company-data.ts` + `ReportingPeriod` from user input.

Key cells written:
- I9/J9 = startDate, L9/M9 = endDate
- Rows 20-32, cols I:N = company info
- Row 62 = goods category (E/F + I:M)
- Row 83 = production process (E/F/G:K/L/M)
- Row 102 = purchased precursor (E/F/G:K/L/M)

### ⬜ Next Sheets (implement one at a time)
Suggested order based on data dependencies:
1. **D_Processes** — process-level emission data (needs `emission_by_process_meta_engitech`)
2. **B_EmInst** — installation-level emissions (aggregates from D_Processes)
3. **C_Emissions&Energy** — detailed emission and energy data
4. **E_PurchPrec** — precursor quantities (needs `sales_data`)
5. **Summary sheets** — likely auto-calculated, may not need fillers

## Known Issues
- **Longitude bug**: Template has same coordinate string for both lat and lng in A_InstData rows 28-29. Pune longitude ≈ 73°52'E, not 18°38'. Flagged for client verification.
- **Single goods/process/precursor**: V1 hardcodes one of each in rows 62, 83, 102. Will need loop when companies have multiple.

## GCS Storage
Generated reports stored at: `reports/{companySlug}/{date}_{fileName}`
Logged in `file_uploads` with `upload_type = "report"`, `year`, `quarter` columns (already in schema).
Reuses `uploadToGCS()` and `getSignedDownloadUrl()` from `lib/storage.ts`.

## Testing
```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"companySlug":"meta_engitech_pune","year":2025,"quarter":2}'
```
Response includes `downloadUrl`. Download and open in Excel to verify:
- I9/J9 = 2025-04-01, L9/M9 = 2025-06-30
- I20:N20 = "METAMORPHOSIS ENGITECH INDIA PVT. LTD"
- Rows 21-32 populated with address/contact
- Rows 62, 83, 102 filled with goods/process/precursor data
- All Excel formulas still calculate correctly
