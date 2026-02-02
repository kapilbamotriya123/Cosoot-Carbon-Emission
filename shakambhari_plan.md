Shakambhari Production Data — Parsing, Storage & Table Rename
Context for Future Sessions
This plan covers Phase 7 of Cosoot V1: adding Shakambhari as the second company. Shakambhari's data is fundamentally different from Meta Engitech — single file with daily production + consumption data (no separate routing/consumption uploads), many emission sources (not just electricity/LPG/diesel), and net emission = consumed - byproduct.

Emission calculation is deferred until emission factors are provided by the client.

Key user requirements:

Parse by header name (not column index) — apply to both Shakambhari and Meta Engitech parsers
Excel only for Shakambhari (no CSV support needed)
Store essential columns only (skip PROD GROUP, ORD TYPE, PRODUCTION VAL, COMP GROUP, COMP GROUPDESC, PRODUCTION VERSION DESC.)
Rename existing emission tables now (add _meta_engitech suffix)
Step 1: Create Shared Parser Utilities
New file: lib/parsers/utils.ts
This extracts common logic that all parsers will share — header mapping, number parsing, date parsing. Currently toNumberOrNull is duplicated in the consumption parser and will also be needed in the Shakambhari parser.


import ExcelJS from "exceljs";

/**
 * Build a case-insensitive column name → column index map from a header row.
 * Trims whitespace, collapses multiple spaces, and lowercases for resilient matching.
 */
export function buildColumnMap(headerRow: ExcelJS.Row): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value ?? "")
      .trim()
      .replace(/\s+/g, " ")   // collapse "Energy  MSEB" → "Energy MSEB"
      .toLowerCase();
    if (name) colMap[name] = colNumber;
  });
  return colMap;
}

/**
 * Given expected header names, resolve them to column indices.
 * Throws if any required headers are missing.
 * Keys in `expected` are field names, values are header text (will be lowercased + space-collapsed).
 */
export function resolveColumns(
  colMap: Record<string, number>,
  expected: Record<string, string>
): Record<string, number> {
  const resolved: Record<string, number> = {};
  const missing: string[] = [];

  for (const [field, headerName] of Object.entries(expected)) {
    const normalized = headerName.trim().replace(/\s+/g, " ").toLowerCase();
    const idx = colMap[normalized];
    if (idx === undefined) {
      missing.push(`${field} (expected: "${headerName}")`);
    } else {
      resolved[field] = idx;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing columns: ${missing.join(", ")}. ` +
      `Found: [${Object.keys(colMap).join(", ")}]`
    );
  }

  return resolved;
}

/**
 * Safely convert an Excel cell value to a number, or null if empty/non-numeric.
 * Handles comma-formatted strings like "2,303,000.00".
 */
export function toNumberOrNull(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  let raw = value;
  if (typeof raw === "string") {
    raw = raw.replace(/,/g, "");
  }
  const num = Number(raw);
  return isNaN(num) ? null : num;
}

/**
 * Convert an Excel date cell to ISO date string (YYYY-MM-DD).
 * Handles: Date objects, "M/DD/YY" strings, "MM/DD/YYYY" strings.
 */
export function toISODate(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  const str = String(value).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return str; // fallback: return as-is
}

/**
 * Convert an Excel date cell to DD-MM-YYYY format (Meta Engitech legacy format).
 */
export function toDateStringDDMMYYYY(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(value).trim();
}
Step 2: Refactor Meta Engitech Consumption Parser to Header-Based Lookup
File: lib/parsers/consumption/meta-engitech-pune.ts
Current (fragile): Uses hardcoded column indices — row.getCell(1), row.getCell(2), etc.

New (resilient): Read header from row 3 (where Meta Engitech headers live), build column map, resolve columns by name.

Meta Engitech consumption headers (from row 3, verified from screenshot):


const EXPECTED_HEADERS = {
  sequence:       "Sequence",
  workCenter:     "WorkCenter",
  description:    "Description",
  productionMT:   "Production in MT",
  uomProduction:  "UOM Production",
  totalEnergyKWh: "Total Energy in KWh",
  energyMSEB:     "Energy MSEB KWh",        // actual header has double space "Energy  MSEB KWh"
  energySolar:    "Energy Solar KWh",
  uomElect:       "UOM Elect. Energy",
  lpgKg:          "LPG consumption in Kg",
  uomLPG:         "UOM LPG",
  dieselLtrs:     "Diesel consumption in Ltrs",
  uomDiesel:      "UOM Diesel",
  dateValue:      "DateVAlue",               // note: capital A in original
};
Note: The buildColumnMap utility collapses multiple spaces and lowercases everything, so "Energy  MSEB KWh" becomes "energy mseb kwh" and matches "Energy MSEB KWh" after the same normalization. Similarly, "DateVAlue" lowercases to "datevalue".

Changes to make:

Import buildColumnMap, resolveColumns, toNumberOrNull, toDateStringDDMMYYYY from ../utils
Remove local toNumberOrNull and toDateString functions (now in utils)
After getting the worksheet, build column map from row 3: const colMap = buildColumnMap(worksheet.getRow(3))
Resolve: const COL = resolveColumns(colMap, EXPECTED_HEADERS)
Replace all row.getCell(N) calls with row.getCell(COL.fieldName) calls
Keep existing validation (A4 = 1) but use COL.sequence instead of hardcoded column 1
Keep existing duplicate work center check
Step 3: Refactor Meta Engitech Routing Parser to Header-Based Lookup
File: lib/parsers/meta-engitech-pune.ts
Current: Uses hardcoded row.getCell(1) through row.getCell(6). Uses ExcelJS streaming reader.

Routing headers (row 1):


const EXPECTED_HEADERS = {
  materialType:      "Material Type",       // or whatever the actual header is
  materials:         "Materials",
  material:          "Material",
  workCenter:        "Work Center",
  operationShortText: "Operation Short Text",
};
Challenge: This parser uses the streaming reader (ExcelJS.stream.xlsx.WorkbookReader), where rows are emitted as events. We need to capture the header row (row 1) to build the column map, then use it for subsequent rows.

Changes:

Import buildColumnMap, resolveColumns from ../utils
On row 1: instead of continue, build the column map from this row
After row 1: resolve columns
All subsequent rows: use row.getCell(COL.materialType) etc.
Important: The streaming reader's row object supports eachCell() just like the non-streaming version, so buildColumnMap works directly. But we need to build the map manually since the streaming row might not support eachCell the same way — we'll need to iterate cells. Actually, ExcelJS streaming rows DO support getCell(colNumber) and we can iterate by checking cells. For the header row we can read cells 1-10 and build the map manually, or use row.values (which returns a sparse array of cell values indexed by column number).

Alternative approach for streaming: Use row.values which returns [undefined, cellVal1, cellVal2, ...] (1-indexed). Build the map from that:


const headerValues = row.values as (string | undefined)[];
const colMap: Record<string, number> = {};
headerValues.forEach((val, idx) => {
  if (val) {
    const name = String(val).trim().replace(/\s+/g, " ").toLowerCase();
    colMap[name] = idx;
  }
});
Step 4: Rename Meta Engitech Emission Tables
File: lib/schema.ts
Add a guarded rename block before the CREATE TABLE statements:


-- Rename Meta Engitech emission tables to be company-specific
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'emission_by_process' AND table_schema = 'public') THEN
    ALTER TABLE emission_by_process RENAME TO emission_by_process_meta_engitech;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'emission_by_product' AND table_schema = 'public') THEN
    ALTER TABLE emission_by_product RENAME TO emission_by_product_meta_engitech;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE indexname = 'idx_emission_by_product_lookup') THEN
    ALTER INDEX idx_emission_by_product_lookup
      RENAME TO idx_emission_by_product_meta_engitech_lookup;
  END IF;
END $$;
Then update the CREATE TABLE IF NOT EXISTS statements to use emission_by_process_meta_engitech and emission_by_product_meta_engitech.

Files that reference old table names — all need _meta_engitech suffix:
File	What to Change
lib/schema.ts (lines 58-96)	CREATE TABLE statements
lib/emissions/engine.ts (lines 81, 104, 139, 174)	DELETE FROM + INSERT INTO queries
app/api/emissions/by-process/route.ts (line 44)	FROM emission_by_process → FROM emission_by_process_meta_engitech
app/api/emissions/by-product/route.ts (lines 41, 57)	FROM emission_by_product → FROM emission_by_product_meta_engitech
app/api/emissions/summary/route.ts (lines 50, 62)	Both table names
Step 5: Create Shakambhari Production Table
File: lib/schema.ts (add to initializeSchema, after existing tables)

CREATE TABLE IF NOT EXISTS production_data_shakambhari (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  work_center TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT,
  order_no TEXT NOT NULL,
  production_version TEXT,
  production_qty NUMERIC NOT NULL DEFAULT 0,
  production_uom TEXT DEFAULT 'TO',
  plant TEXT,
  sources JSONB NOT NULL DEFAULT '[]',
  original_file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, date, work_center, product_id, order_no)
);

CREATE INDEX IF NOT EXISTS idx_prod_shak_lookup
  ON production_data_shakambhari (company_slug, year, month);
JSONB sources shape:


[
  {
    "compMat": "11000032",
    "compName": "Manganese Ore (30-32) Lumps",
    "compUom": "TO",
    "consumedQty": 37.85,
    "byproductQty": 0,
    "consumedVal": 359430.79,
    "byproductVal": 0
  }
]
Step 6: Create Production Parser Types
New file: lib/parsers/production/types.ts

export interface ProductionSource {
  compMat: string;       // COMP MAT
  compName: string;      // COMP MATDESC
  compUom: string;       // COMP UOM
  consumedQty: number;   // CONSUMED QTY
  byproductQty: number;  // BYPRODUCT QTY
  consumedVal: number;   // CONSUMED VAL
  byproductVal: number;  // BYPRODUCT VAL
}

export interface ProductionRecord {
  date: string;              // "YYYY-MM-DD"
  year: number;
  month: number;
  plant: string;
  productId: string;         // PROD MAT
  productName: string;       // PROD MATDESC
  orderNo: string;           // ORDER NO
  productionVersion: string; // PRODUCTION VERSION
  workCenter: string;        // WORK CENTER
  productionQty: number;     // PRODUCTION QTY
  productionUom: string;     // PROD UOM
  sources: ProductionSource[];
}

export type ProductionParser = (buffer: ArrayBuffer) => Promise<ProductionRecord[]>;
Step 7: Create Production Parser Registry
New file: lib/parsers/production/index.ts
Exact pattern from lib/parsers/consumption/index.ts:

Registry object: { shakambhari: parseShakambhari }
getProductionParser(companySlug) function — throws if no parser found
Re-export types: ProductionRecord, ProductionSource, ProductionParser
Step 8: Create Shakambhari Parser
New file: lib/parsers/production/shakambhari.ts
Shakambhari headers (row 1 of Excel — exact text from the actual data):


const EXPECTED_HEADERS = {
  postingDate:    "POSTING DATE",
  plant:          "PLANT",
  prodMat:        "PROD MAT",
  orderNo:        "ORDER NO",
  prodVersion:    "PRODUCTION VERSION",
  prodMatDesc:    "PROD MATDESC",
  prodUom:        "PROD UOM",
  workCenter:     "WORK CENTER",
  productionQty:  "PRODUCTION QTY",
  compMat:        "COMP MAT",
  compMatDesc:    "COMP MATDESC",
  compUom:        "COMP UOM",
  consumedQty:    "CONSUMED QTY",
  byproductQty:   "BYPRODUCT QTY",
  consumedVal:    "CONSUMED VAL",
  byproductVal:   "BYPRODUCT VAL",
};
// Columns we intentionally skip:
// PRODUCTION VERSION DESC., PROD GROUP, ORD TYPE, PRODUCTION VAL, COMP GROUP, COMP GROUPDESC
Parsing algorithm (detailed pseudocode):


function parseShakambhari(buffer: ArrayBuffer): ProductionRecord[]
  1. workbook = new ExcelJS.Workbook()
     workbook.xlsx.load(buffer)

  2. worksheet = workbook.worksheets[0]
     if (!worksheet) throw "No worksheet found"

  3. headerRow = worksheet.getRow(1)
     colMap = buildColumnMap(headerRow)
     COL = resolveColumns(colMap, EXPECTED_HEADERS)

  4. records: ProductionRecord[] = []
     currentRecord: ProductionRecord | null = null

  5. for rowNum = 2 to worksheet.rowCount:
       row = worksheet.getRow(rowNum)

       prodMat = String(row.getCell(COL.prodMat).value ?? "").trim()
       compMat = String(row.getCell(COL.compMat).value ?? "").trim()

       // Skip completely empty rows
       if (!prodMat && !compMat) continue

       // --- NEW PRODUCT GROUP ---
       if (prodMat):
         // Flush previous record
         if (currentRecord) records.push(currentRecord)

         // Parse date
         dateRaw = row.getCell(COL.postingDate).value
         dateISO = toISODate(dateRaw)
         dateObj = new Date(dateISO)

         currentRecord = {
           date: dateISO,
           year: dateObj.getFullYear(),
           month: dateObj.getMonth() + 1,
           plant: String(row.getCell(COL.plant).value ?? "").trim(),
           productId: prodMat,
           productName: String(row.getCell(COL.prodMatDesc).value ?? "").trim(),
           orderNo: String(row.getCell(COL.orderNo).value ?? "").trim(),
           productionVersion: String(row.getCell(COL.prodVersion).value ?? "").trim(),
           workCenter: String(row.getCell(COL.workCenter).value ?? "").trim(),
           productionQty: toNumberOrNull(row.getCell(COL.productionQty).value) ?? 0,
           productionUom: String(row.getCell(COL.prodUom).value ?? "").trim(),
           sources: [],
         }

         // This row may ALSO have component data (COMP MAT populated)
         if (compMat):
           currentRecord.sources.push(extractSource(row, COL))

       // --- COMPONENT ROW (source for current product) ---
       else if (compMat && currentRecord):
         currentRecord.sources.push(extractSource(row, COL))

  6. // Flush last record
     if (currentRecord) records.push(currentRecord)

  7. if (records.length === 0) throw "No production records found"

  8. return records

function extractSource(row, COL): ProductionSource
  return {
    compMat: String(row.getCell(COL.compMat).value ?? "").trim(),
    compName: String(row.getCell(COL.compMatDesc).value ?? "").trim(),
    compUom: String(row.getCell(COL.compUom).value ?? "").trim(),
    consumedQty: toNumberOrNull(row.getCell(COL.consumedQty).value) ?? 0,
    byproductQty: toNumberOrNull(row.getCell(COL.byproductQty).value) ?? 0,
    consumedVal: toNumberOrNull(row.getCell(COL.consumedVal).value) ?? 0,
    byproductVal: toNumberOrNull(row.getCell(COL.byproductVal).value) ?? 0,
  }
Edge cases handled:

Product header row also has COMP MAT data → extracted as first source
Comma-formatted numbers (e.g., "2,303,000.00") → toNumberOrNull strips commas
Excel Date objects → toISODate handles them
String dates like "2/28/25" → toISODate parses via new Date()
S1_MRPU1 work center with different ORD TYPE (SI15 vs SI14) → treated the same, no special handling
Step 9: Create Upload API Route
New file: app/api/production/upload/route.ts
Request: POST /api/production/upload

multipart/form-data with file + companySlug
No year/month params — dates extracted from parsed data
Flow (detailed):


1. Auth check: const { userId } = await auth()
   if (!userId) return 401

2. Validate: file and companySlug from formData

3. await initializeSchema()

4. Upload to GCS:
   path = `production_data/${companySlug}/${Date.now()}_${file.name}`
   fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), path)

5. Parse:
   parser = getProductionParser(companySlug)
   records = await parser(arrayBuffer)

6. Upsert company:
   INSERT INTO companies (slug, display_name, clerk_user_id)
   VALUES ($1, $2, $3)
   ON CONFLICT (slug) DO UPDATE SET clerk_user_id = $3

7. Transaction — delete-then-insert for affected dates:
   BEGIN
     // Extract unique dates
     uniqueDates = [...new Set(records.map(r => r.date))]

     DELETE FROM production_data_shakambhari
     WHERE company_slug = $1 AND date = ANY($2::date[])

     // Batch INSERT using unnest()
     // Build parallel arrays for each column
     INSERT INTO production_data_shakambhari
       (company_slug, date, year, month, work_center, product_id, product_name,
        order_no, production_version, production_qty, production_uom, plant,
        sources, original_file_url)
     SELECT * FROM unnest(
       $1::text[], $2::date[], $3::int[], $4::int[], $5::text[], $6::text[],
       $7::text[], $8::text[], $9::text[], $10::numeric[], $11::text[],
       $12::text[], $13::jsonb[], $14::text[]
     )
   COMMIT

8. Return JSON:
   {
     message: "Production data uploaded successfully",
     recordCount: records.length,
     dateRange: { from: minDate, to: maxDate },
     productsFound: [...uniqueProductIds],
     workCentersFound: [...uniqueWorkCenters]
   }
Note on JSONB in unnest(): Each record's sources array gets JSON.stringify()'d before going into the unnest $13::jsonb[] array.

Step 10: Create Upload UI Page
New file: app/dashboard/upload-production/page.tsx
Based on app/dashboard/upload-consumption/page.tsx structure but simpler:

No year/month selectors (dates are in the data)
Company dropdown: [{ slug: "shakambhari", label: "Shakambhari" }]
File input: accepts .xlsx, .xls only (no .csv)
Upload button + result display
Posts to /api/production/upload with file + companySlug
Shows: record count, date range, products found, work centers found
Step 11: Update Dashboard Page
File: app/dashboard/page.tsx (line ~26, inside the flex gap-4 div)
Add third link:


<Link
  href="/dashboard/upload-production"
  className="inline-block px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
>
  Upload Production Data
</Link>
Step 12: Update V1_FLOW.md
Add after existing Phase 6:


### Phase 7: Shakambhari — Production Data Upload
- Single Excel file contains routing + consumption (no separate uploads)
- Daily data (not monthly like Meta Engitech)
- Header-based parsing (column lookup by name, not index)
- Parser groups rows by product (PROD MAT populated = new product group)
- Sources stored in JSONB array per record
- Stored in `production_data_shakambhari` table
- One row per (company_slug, date, work_center, product_id, order_no)
- Upsert: re-uploading same dates replaces existing records

### Phase 8: Shakambhari — Emission Calculation (Pending)
- Emission factors not yet available from client
- Net emission per source = (consumed_qty - byproduct_qty) × emission_factor
- Emission factor mapping: component material → factor (to be stored separately)
- Scopes: classification depends on source type (not fixed like Meta Engitech)
- Formulas may change monthly — factors stored separately from code
- Results will go in Shakambhari-specific emission tables (schema TBD)
Step 13: Update DECISIONS.md
Add decisions:

Decision 7: Granular rows with JSONB sources for Shakambhari — one row per (company_slug, date, work_center, product_id, order_no), sources as JSONB array. Better than one-blob-per-date because it allows SQL WHERE on structured columns and natural append/upsert.
Decision 8: No separate routing upload for Shakambhari — product→work center mapping is embedded in the production data file.
Decision 9: Separate /api/production/upload route — Shakambhari's data shape is fundamentally different from Meta Engitech's consumption data (daily vs monthly, embedded routing, different sources).
Decision 10: Renamed Meta Engitech emission tables to _meta_engitech suffix — the generic names had Meta-specific columns (electricity/LPG/diesel). Clear naming prevents confusion when adding Shakambhari emission tables later.
Decision 11: Header-based column lookup in all parsers — resilient to column reordering, shared utility in lib/parsers/utils.ts.
Complete File List (Build Order)
#	Action	File	What
1	CREATE	lib/parsers/utils.ts	Shared: buildColumnMap, resolveColumns, toNumberOrNull, toISODate, toDateStringDDMMYYYY
2	MODIFY	lib/parsers/consumption/meta-engitech-pune.ts	Header-based column lookup (row 3), use shared utils
3	MODIFY	lib/parsers/meta-engitech-pune.ts	Header-based column lookup (row 1), use shared utils
4	MODIFY	lib/schema.ts	Rename migration DO block + update CREATE TABLE names + add new table
5	MODIFY	lib/emissions/engine.ts	emission_by_process → emission_by_process_meta_engitech (4 places)
6	MODIFY	app/api/emissions/by-process/route.ts	Table name in SELECT
7	MODIFY	app/api/emissions/by-product/route.ts	Table name in SELECT (2 queries)
8	MODIFY	app/api/emissions/summary/route.ts	Table names in SELECT (2 queries)
9	CREATE	lib/parsers/production/types.ts	ProductionSource, ProductionRecord, ProductionParser
10	CREATE	lib/parsers/production/index.ts	Registry + getProductionParser()
11	CREATE	lib/parsers/production/shakambhari.ts	Excel parser with header-based lookup
12	CREATE	app/api/production/upload/route.ts	Upload route: parse → GCS → DB upsert
13	CREATE	app/dashboard/upload-production/page.tsx	Upload UI (company selector + file input)
14	MODIFY	app/dashboard/page.tsx	Add "Upload Production Data" link
15	MODIFY	V1_FLOW.md	Add Phase 7 + Phase 8
16	MODIFY	DECISIONS.md	Add decisions 7-11
Dependencies: 1 must come before 2,3,11. Step 4 must come before 5-8. Steps 9,10 before 11. Step 11 before 12. Otherwise parallelizable.

Verification
npm run build — no type errors after all changes
Hit /api/setup — verify old tables renamed + new table created
Meta Engitech still works — hit /api/emissions/by-process?companySlug=meta_engitech_pune&year=2025&month=5 (or whatever month has data)
Upload Shakambhari Excel via /dashboard/upload-production:
Select Shakambhari, upload the .xlsx file
Verify response: record count, date range, products, work centers
Check DB — SELECT count(*), min(date), max(date) FROM production_data_shakambhari
Re-upload same file — verify count stays the same (upsert works, no duplicates)
JSONB queryability — SELECT product_name, jsonb_array_length(sources) FROM production_data_shakambhari LIMIT 5