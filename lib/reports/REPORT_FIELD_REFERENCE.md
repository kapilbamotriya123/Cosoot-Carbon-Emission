# CBAM Report — Field Reference

Quick reference for what each sheet filler writes and where the data comes from.
Use this to trace any incorrect value back to its source.

---

## A_InstData — Installation Data

| Cell(s) | Field | Value | Source |
|---------|-------|-------|--------|
| I9, J9 | Reporting period start | Date | `period.startDate` (computed from year+quarter) |
| L9, M9 | Reporting period end | Date | `period.endDate` |
| I20–N20 | Legal name | String | `CompanyProfile.legalName` |
| I21–N21 | Street address | String | `CompanyProfile.streetAddress` |
| I23–N23 | Post code | String | `CompanyProfile.postCode` |
| I25–N25 | City | String | `CompanyProfile.city` |
| I26–N26 | Country | String | `CompanyProfile.country` |
| I27–N27 | UNLOCODE | String | `CompanyProfile.unlocode` |
| I28–N28 | Latitude | String | `CompanyProfile.latitude` |
| I29–N29 | Longitude | String | `CompanyProfile.longitude` |
| I30–N30 | Authorized rep name | String | `CompanyProfile.authorizedRepName` |
| I31–N31 | Email | String | `CompanyProfile.email` |
| I32–N32 | Telephone | String | `CompanyProfile.telephone` |
| E62, F62 | Goods category | String | `CompanyProfile.goodsCategory` |
| I62–M62 | Production routes | String | `CompanyProfile.productionRoutes` |
| E83 | Goods category (process) | String | `CompanyProfile.goodsCategory` |
| F83 | Process scope | String | `CompanyProfile.processScope` |
| G83–K83 | Included goods | "n.a." | Hardcoded (scope is "direct only") |
| L83, M83 | Process name | String | `CompanyProfile.processName` |
| E102 | Goods category (precursor) | String | `CompanyProfile.goodsCategory` |
| F102 | Precursor country code | String | `CompanyProfile.precursorCountryCode` |
| G102–K102 | Production routes | String | `CompanyProfile.productionRoutes` |
| L102, M102 | Precursor name | String | `CompanyProfile.precursorName` |

All values from `CompanyProfile` are hardcoded in `lib/reports/company-data.ts`.

---

## B_EmInst — Source Streams

Lists direct emission source streams (fuels). Meta Engitech has 2: Diesel and LPG.

| Cell | Field | Value | Source |
|------|-------|-------|--------|
| D17 | Method | "Combustion" | Hardcoded |
| E17 | Source stream | "Diesel" | Hardcoded |
| F17 | Activity data (tonnes) | Number | `consumption_data` JSONB → SUM(`dieselConsumptionLtrs`) × `diesel_density` / 1000 |
| G17 | AD Unit | "t" | Hardcoded |
| H17 | NCV | Number (e.g. 43) | `emission_constants` table → `diesel_ncv` (fallback: `lib/emissions/constants.ts`) |
| J17 | EF | Number (e.g. 74.1) | `emission_constants` table → `diesel_ef` |
| K17 | EF Unit | "tCO2/TJ" | Hardcoded |
| D18 | Method | "Combustion" | Hardcoded |
| E18 | Source stream | "LPG" | Hardcoded |
| F18 | Activity data (tonnes) | Number | `consumption_data` JSONB → SUM(`lpgConsumptionKg`) / 1000 |
| G18 | AD Unit | "t" | Hardcoded |
| H18 | NCV | Number (e.g. 47.3) | `emission_constants` table → `lpg_ncv` |
| J18 | EF | Number (e.g. 63.1) | `emission_constants` table → `lpg_ef` |
| K18 | EF Unit | "tCO2/TJ" | Hardcoded |

**DO NOT write to:** I (NCV Unit — SHARED_FORMULA), M (C-Content Unit — SHARED_FORMULA), O (OxF Unit)

**DB query:** `SELECT data FROM consumption_data WHERE company_slug=$1 AND year=$2 AND month=ANY($3)`
Each row's `data` is JSONB keyed by work center code. Sum fuel fields across all work centers and all months.

---

## C_Emissions&Energy — GHG Balance & Data Quality

Mostly auto-calculated from B_EmInst via formulas. Only 3 FILL_IN areas:

| Cell(s) | Field | Value | Source |
|---------|-------|-------|--------|
| M26 | Total indirect emissions (tCO2e) | Number | `consumption_data` JSONB → SUM(`totalEnergyKWh`) × `electricity_ef` / 1000. This converts total kWh to tCO2e using the grid emission factor. |
| H40–N40 | Data quality approach | String | `CompanyProfile.dataQualityApproach` (e.g. "Mostly measurements & analyses") |
| H42 | Quality assurance approach | String | `CompanyProfile.qualityAssuranceApproach` (e.g. "None") |

**M26 formula trace:** `totalEnergyKWh` = grid + solar electricity per work center per month.
`electricity_ef` = 0.598 kg CO2/kWh (from `emission_constants` or fallback).
Calculation: SUM(totalEnergyKWh across all WCs × all months) × 0.598 / 1000 = tCO2e.

---

## D_Processes — Production Process Emissions (Process 1 only)

Requires additional API params: `customerCode` and `materialIds[]`.
Only Process 1 (rows 11–72) is filled for Meta Engitech.

| Cell | Field | Value | Source |
|------|-------|-------|--------|
| L16 | Total production level (t) | Number | `sales_data` → SUM(quantity_mt) for customer + materials in quarter |
| L27 | Produced for the market (t) | Number | Same as L16 (all production is for market) |
| L41 | Consumed for non-CBAM goods | 0 | Hardcoded (Meta has no non-CBAM consumption) |
| K50 | Measurable heat applicable | Boolean | `CompanyProfile.measurableHeatApplicable` (false for Meta) |
| L50 | Waste gases applicable | Boolean | `CompanyProfile.wasteGasesApplicable` (false for Meta) |
| L54 | Direct emissions (tCO2e) | Number | For each material: `scope1_intensity` (from `emission_by_product_meta_engitech`, AVG across quarter months) × `quantity_mt` (from `sales_data`). Sum across all selected materials. |
| L65 | Electricity consumption (MWh) | Number | For each material: `scope2_intensity × quantity_mt / electricity_ef_MWh`. Back-calculated from scope2 intensity. |
| L66 | Electricity EF (tCO2/MWh) | Number | `emission_constants` → `electricity_ef` × 1000 (e.g. 0.598) |
| L67 | EF source | String | `CompanyProfile.electricityEFSource` (e.g. "Mix") |
| L71 | Electricity exported (MWh) | 0 | Always 0 |
| L72 | Exported electricity EF | Number | Same as L66 |

**DO NOT write to:** M50 (FORMULA from goods category), L24 (=SUM), L28/L29/L42 (formulas)

**DB queries:**
1. `sales_data` → `SELECT material_id, SUM(quantity_mt) FROM sales_data WHERE company_slug=$1 AND year=$2 AND month=ANY($3) AND customer_code=$4 AND material_id=ANY($5) GROUP BY material_id`
2. `emission_by_product_meta_engitech` → `SELECT product_id, AVG(scope1_intensity), AVG(scope2_intensity) WHERE ... GROUP BY product_id`

**Electricity data source by company:**
- Meta Engitech: `consumption_data` JSONB → `totalEnergyKWh` per work center. Scope2 intensity is calculated from this in `lib/emissions/calculate.ts`.
- Shakambhari: `production_data_shakambhari.sources[]` → component with `compName = "Mix Power"` and `compUom = "KWH"`. Uses `consumedQty` field.

---

## E_PurchPrec — Purchased Precursor Emissions (Precursor 1 only)

Uses the same `dProcesses.totalQuantityMT` from D_Processes, multiplied by a waste factor (1.1×).
Only Precursor 1 (rows 14–54) is filled for Meta Engitech. Precursor = "MS STEEL COIL".

| Cell | Field | Value | Source |
|------|-------|-------|--------|
| L17 | Total purchased level (t) | Number | `dProcesses.totalQuantityMT × CompanyProfile.precursorWasteMultiplier` (e.g. × 1.1) |
| L28 | Consumed in production process 1 (t) | Number | Same as L17 |
| L38 | Consumed for non-CBAM goods | 0 | Hardcoded |
| L49 | SEE (direct) (tCO2e/t) | Number | `CompanyProfile.precursorSEEDirect` (Meta: 1.89) |
| M49 | SEE (direct) source | String | `CompanyProfile.precursorSEEDirectSource` (Meta: "Default") |
| L50 | Specific electricity consumption (MWh/t) | Number | `CompanyProfile.precursorElecConsumption` (Meta: 0.44) |
| M50 | Source | String | `CompanyProfile.precursorElecConsumptionSource` (Meta: "Default") |
| L51 | Electricity EF (tCO2e/MWh) | Number | `CompanyProfile.precursorElecEF` (Meta: 0.727) |
| M51 | Source | String | `CompanyProfile.precursorElecEFSource` (Meta: "Mix") |
| K54–M54 | Justification for defaults | String | `CompanyProfile.precursorDefaultJustification` (Meta: "Data gaps") |

**DO NOT write to:** L25 (=SUM(L17:L24)), L39 (control formula), L52 (=L50×L51), K17/K28/K38/K49/K50/K51 (unit labels are formulas)

All static values from `CompanyProfile` are hardcoded in `lib/reports/company-data.ts`.

---

## Summary_Products — Product Summary (Row 10 only)

Only 5 yellow FILL_IN cells in row 10. All other columns (E, G, I–O, etc.) are auto-calculated formulas.

| Cell | Field | Value | Source |
|------|-------|-------|--------|
| D10 | Production process name | String | `CompanyProfile.summaryProcessName` (Meta: "ERW tubes, CEW tubes") |
| F10 | CN Code | String | `CompanyProfile.summaryCNCode` (Meta: "73063012") |
| H10 | Product name (for invoices) | String | `CompanyProfile.summaryProductName` (Meta: "STAINLESS STEEL") |
| P10 | Main reducing agent | String | `CompanyProfile.summaryReducingAgent` (Meta: "Coal or coke") |
| Q10 | Steel mill ID number | Number | `CompanyProfile.summarySteelMillId` (Meta: 0) |

**DO NOT write to:** E10 (FORMULA from process), G10 (FORMULA from CN code), I10–O10 (all FORMULA from InputOutput/D_Processes)

All static values from `CompanyProfile` are hardcoded in `lib/reports/company-data.ts`.
