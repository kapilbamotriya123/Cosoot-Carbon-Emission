# Cosoot V1 — System Flow

## Overview

Carbon emission calculator for industrial companies. Admin onboards clients, clients upload consumption data monthly, system calculates emissions per work center and emission intensity per product.

---

## Build Order

### Phase 1: Auth (Clerk)
- Integrate Clerk with Next.js
- Login page (email/password only, no signup)
- Forgot password flow (handled by Clerk)
- Admin creates accounts via Clerk dashboard
- Protected routes (middleware)

### Phase 2: Company Onboarding — BOM/Routing Upload
- Company uploads their BOM/routing Excel file (one-time, semi-permanent)
- Server-side parsing with `xlsx` or `exceljs`
- Extract: finished products (FG rows) → their work centers (intermediate steps)
- Store parsed data as JSONB in PostgreSQL (GCP Cloud SQL)
- Store original Excel in GCP Cloud Storage as backup
- This data defines the product flow (which work centers a product passes through)

### Phase 3: Monthly Consumption Upload
- Company uploads monthly consumption Excel
- Server-side parsing — extract per-work-center: production (MT), electricity (kWh), LPG (kg), diesel (litres)
- Store parsed data as JSONB in PostgreSQL
- Store original Excel in GCP Cloud Storage

### Phase 4: Emission Calculation Engine
- On monthly upload (or on demand), calculate:

**Per Work Center:**
- Electricity emission = kWh/tonne × 0.598 ÷ 1000 (tCO₂)
- LPG emission = (kg LPG/tonne × 47.3 × 63.1) ÷ 1,000,000 (tCO₂)
- Diesel emission = (litre/tonne × 43 × 74.1 × 0.832) ÷ 1,000,000 (tCO₂)
- Total emission = electricity + LPG + diesel

**Per Product (Emission Intensity):**
- Find all work centers for the product (from BOM/routing data)
- Sum emissions across those work centers
- Divide by total production across those work centers
- Result = emission intensity for that product

Store calculated results as JSONB in PostgreSQL.

### Phase 5: Dashboard
- Per-product emission breakdown
- Per-work-center emission breakdown
- Monthly trends
- Node-flow UI for product routes (shows work center sequence per product — visual only, no consumption data on nodes)

### Phase 6: Admin Panel
- Manage companies (via Clerk dashboard initially)
- View all company data
- Trigger recalculations if needed

### Phase 7: Shakambhari — Production Data Upload
- Single Excel file contains routing + consumption (no separate uploads)
- Daily data (not monthly like Meta Engitech)
- Header-based parsing (column lookup by name, not index)
- Parser groups rows by product (PROD MAT populated = new product group)
- Sources stored in JSONB array per record
- Stored in `production_data_shakambhari` table
- One row per (company_slug, date, work_center, product_id, order_no)
- Upsert: re-uploading same dates replaces existing records

### Phase 8: Shakambhari — Emission Calculation Engine ✅
- **Carbon mass balance approach** — fundamentally different from Meta Engitech's fuel consumption model
- Each source classified as: `input`, `byproduct`, `main_product`, or `electricity`
- **Material formula:** CE = quantity × carbonContent, CO2e = CE × 44/12 (molecular weight ratio)
- **Electricity formula:** CO2e = kWh × 0.000598 tCO₂/kWh (CEA grid factor, stored as configurable constant)
- **Main product** uses `production_qty` from parent record (not from sources array), treated as output
- **Net emission:** Scope 1 = Σ(input CO2e) − Σ(main product CO2e + byproduct CO2e). Scope 2 = electricity CO2e. Total = Scope 1 + Scope 2
- Carbon content values stored in `lib/emissions/shakambhari/constants.ts` (placeholder values — to be moved to DB table when client provides real values)
- Missing carbon content → warning (not error), material treated as 0 emission
- Results stored in `emission_results_shakambhari` table — one row per production record with JSONB source breakdowns
- Auto-triggered on production upload (fire-and-forget, per affected month)
- Also callable manually via `POST /api/emissions/shakambhari/calculate`
- Engine files: `lib/emissions/shakambhari/{constants,types,calculate,engine}.ts`

### Phase 9: Frontend Dashboard & Visualization
- **UI Framework:** shadcn/ui (new-york style, neutral, lucide icons) — installed and configured
- **Dashboard shell:** Sidebar (1/5 width) + top bar + content area layout using shadcn Sidebar component
- **Company selector:** URL search param (`?company=slug`), admin can switch, regular users locked
- **Data pages:** By Product, By Process, Summary — tables with pagination, company-aware
- **Product flow visualization:** React Flow (`@xyflow/react`) with pre-computed node layouts stored in DB
  - Meta Engitech: generate nodes for all products from routing data, store once
  - Shakambhari: detect new products on monthly upload, generate only for new ones, reuse existing
- **Node layout:** dagre for directed graph auto-layout (left → right: inputs → work centers → product)
- **New API endpoints:** Shakambhari by-product, by-process, summary queries
- **Role-based UI:** Admin sections (uploads) conditionally shown in sidebar. Enforcement deferred until auth re-enabled.
- **See:** `FRONTEND_PLAN.md` for detailed execution plan

---

## Data Flow

### Meta Engitech Flow
```
Excel Upload (BOM/routing)          Excel Upload (monthly consumption)
        │                                       │
        ▼                                       ▼
  Server-side parse                      Server-side parse
  (exceljs library)                      (exceljs library)
        │                                       │
        ▼                                       ▼
  Store in GCP Cloud Storage          Store in GCP Cloud Storage
  (original file backup)              (original file backup)
        │                                       │
        ▼                                       ▼
  Store parsed JSONB                  Store parsed JSONB
  in PostgreSQL                       in PostgreSQL
                                                │
                                                ▼
                                      Emission Calculation
                                      (fuel consumption × constants)
                                                │
                                                ▼
                                      Store results in PostgreSQL
                                      (emission_by_process/product_meta_engitech)
                                                │
                                                ▼
                                          Dashboard
```

### Shakambhari Flow
```
Excel Upload (production data — routing + consumption in one file)
        │
        ▼
  Server-side parse (exceljs)
  Group rows by product, extract sources as JSONB
        │
        ├──▶ Store in GCP Cloud Storage (backup)
        │
        ▼
  Store in PostgreSQL (production_data_shakambhari)
  One row per (date, work_center, product_id, order_no)
        │
        ▼
  Emission Calculation (auto-triggered per affected month)
  Classify each source → input/byproduct/main_product/electricity
  Material: CE = qty × carbonContent, CO2e = CE × 44/12
  Electricity: CO2e = kWh × 0.000598
  Net = Input CO2e − Output CO2e + Electricity CO2e
        │
        ▼
  Store results in PostgreSQL (emission_results_shakambhari)
  Aggregates as NUMERIC columns + source breakdowns as JSONB
        │
        ▼
    Dashboard (shadcn/ui + React Flow)
```

---

## Key Notes

- **Parsing is company-specific.** Each company's Excel format differs. We'll build parsers per company. No universal schema.
- **JSONB everywhere.** No rigid table schemas for company data. PostgreSQL JSONB gives us flexibility while still being queryable.
- **Original Excels are always kept** in GCP Cloud Storage as source of truth / backup.
- **Node-flow UI** shows product → work center sequence only (no consumption/emission data on nodes). To be built later.
