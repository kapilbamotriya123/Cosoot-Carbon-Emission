# Cosoot — Complete Codebase Overview

> **Purpose:** This document captures everything about the Cosoot codebase — architecture, data models, calculations, APIs, frontend, database schema, file structure, and conventions. Use this as the single source of truth when starting new sessions or onboarding new contributors.

---

## Table of Contents

1. [What Is Cosoot](#1-what-is-cosoot)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [The Two Companies & Their Calculation Models](#4-the-two-companies--their-calculation-models)
5. [Database Schema](#5-database-schema)
6. [Data Flow: Upload → Parse → Calculate → Store → Display](#6-data-flow-upload--parse--calculate--store--display)
7. [Parsers (Excel → Structured Data)](#7-parsers-excel--structured-data)
8. [Emission Calculation Engine — Meta Engitech](#8-emission-calculation-engine--meta-engitech)
9. [Emission Calculation Engine — Shakambhari](#9-emission-calculation-engine--shakambhari)
10. [Emission Constants Management](#10-emission-constants-management)
11. [Analytics Layer (Read-Only Aggregation)](#11-analytics-layer-read-only-aggregation)
12. [API Routes Reference](#12-api-routes-reference)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Frontend Pages & Components](#14-frontend-pages--components)
15. [Storage & File Management](#15-storage--file-management)
16. [Code Conventions](#16-code-conventions)
17. [Key Architectural Decisions](#17-key-architectural-decisions)
18. [What Data Is Available for Report Generation](#18-what-data-is-available-for-report-generation)

---

## 1. What Is Cosoot

Cosoot is a **B2B SaaS platform** for carbon emissions tracking and reporting in the manufacturing industry.

**How it works:**
- Admin onboards industrial companies (no public signup)
- Companies upload their production/consumption data (Excel files)
- The system parses the files, calculates carbon emissions using industry-standard formulas (IPCC, CEA India)
- Results are displayed on a dashboard with breakdowns by scope, source, process (work center), and product
- Product flow visualizations show material → work center → product paths

**Current clients:**
- **Meta Engitech Pune** — steel tube manufacturing (slitting, tube mills, galvanizing, etc.)
- **Shakambhari** — ferro alloy smelting (silico manganese, ferro manganese)

**Key insight:** Each company has a fundamentally different emission calculation methodology. The system handles both transparently.

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js (App Router) | 16.1.6 | Full-stack React framework |
| UI Library | React | 19.2.3 | Component rendering |
| Language | TypeScript | 5 | Type safety |
| Component Library | shadcn/ui (Radix primitives) | — | Accessible, customizable UI components |
| Styling | Tailwind CSS | 4 | Utility-first CSS |
| Charts | Recharts | 3.7.0 | Bar charts for analytics |
| Flow Diagrams | React Flow (@xyflow/react) | 12.10.0 | Node-based product flow visualization |
| Graph Layout | dagre | 0.8.5 | Auto-position nodes in flow diagrams |
| Icons | Lucide React | 0.563.0 | Icon library |
| Database | PostgreSQL (GCP Cloud SQL) | — | Primary data store, JSONB for flexible schemas |
| DB Driver | pg | 8.17.2 | Node.js PostgreSQL client |
| Excel Parsing | ExcelJS | 4.4.0 | Server-side Excel file parsing |
| File Storage | GCP Cloud Storage | 7.18.0 | Original Excel file backups |
| Auth | Clerk | 6.37.1 | Authentication (currently **disabled**) |

**Dev Dependencies:** ESLint 9, TypeScript type definitions, Tailwind CSS build tools

---

## 3. Project Structure

```
cosoot_next_project/
├── app/
│   ├── api/                                    # All API routes
│   │   ├── constants/                          # Emission constants CRUD
│   │   │   ├── route.ts                        #   GET/PUT constants
│   │   │   ├── template/route.ts               #   GET Excel template download
│   │   │   └── upload/route.ts                 #   POST upload constants Excel
│   │   ├── consumption/upload/route.ts         # POST consumption data upload
│   │   ├── emissions/
│   │   │   ├── available-periods/route.ts      # GET available year/quarter combos
│   │   │   ├── by-process/route.ts             # GET emissions by work center
│   │   │   ├── by-product/route.ts             # GET emissions by product
│   │   │   ├── by-scope/route.ts               # GET scope 1 + scope 2
│   │   │   ├── by-source/route.ts              # GET emissions by fuel/material source
│   │   │   ├── calculate/route.ts              # POST trigger Meta Engitech calc
│   │   │   ├── recalculate/route.ts            # POST recalculate after constants change
│   │   │   ├── shakambhari/calculate/route.ts  # POST trigger Shakambhari calc
│   │   │   └── summary/route.ts                # GET summary stats
│   │   ├── product-flows/                      # Meta Engitech product flows
│   │   │   ├── route.ts                        #   GET product list (paginated)
│   │   │   └── [productId]/route.ts            #   GET flow nodes + edges
│   │   ├── product-flows-shakambhari/          # Shakambhari product flows
│   │   │   ├── route.ts                        #   GET product list (paginated)
│   │   │   └── [productId]/route.ts            #   GET flow nodes + edges
│   │   ├── production/upload/route.ts          # POST Shakambhari production upload
│   │   ├── routing/upload/route.ts             # POST routing/BOM upload
│   │   ├── setup/route.ts                      # POST initialize DB schema
│   │   └── uploads/                            # Upload history
│   │       ├── route.ts                        #   GET upload history
│   │       └── download/route.ts               #   GET signed download URL
│   ├── dashboard/
│   │   ├── layout.tsx                          # Dashboard shell (sidebar + header)
│   │   ├── page.tsx                            # Overview page
│   │   ├── analytics/page.tsx                  # Analytics with 4 views
│   │   ├── data-upload/page.tsx                # Unified upload hub
│   │   └── product-flows/
│   │       ├── page.tsx                        # Product list
│   │       └── [productId]/page.tsx            # Product flow detail
│   ├── layout.tsx                              # Root layout
│   └── page.tsx                                # Landing (redirects to dashboard)
├── components/
│   ├── app-sidebar.tsx                         # Sidebar navigation
│   ├── company-selector.tsx                    # Company dropdown
│   ├── analytics/                              # Analytics view components
│   │   ├── EmissionsByScope.tsx
│   │   ├── EmissionsBySource.tsx
│   │   ├── EmissionsByProcess.tsx
│   │   └── EmissionsByProduct.tsx
│   ├── data-upload/                            # Upload form components
│   │   ├── unified-consumption-form.tsx        # Smart consumption/production form
│   │   ├── routing-upload-form.tsx             # Large file upload with progress
│   │   ├── constants-editor.tsx                # Constants management UI
│   │   └── upload-history.tsx                  # Upload audit trail table
│   ├── overview/                               # Overview page components
│   │   ├── quarter-selector.tsx                # Year/quarter dropdown
│   │   ├── scope-cards.tsx                     # Scope 1 + 2 summary cards
│   │   └── emissions-ranked-table.tsx          # Ranked emissions table
│   ├── product-flow/                           # Flow diagram components
│   │   ├── flow-diagram.tsx                    # React Flow wrapper
│   │   └── nodes/
│   │       ├── work-center-node.tsx
│   │       ├── material-node.tsx
│   │       └── fuel-node.tsx
│   └── ui/                                     # shadcn/ui components
│       ├── button.tsx, card.tsx, select.tsx, table.tsx, etc.
│       ├── sidebar.tsx                         # Full sidebar system
│       ├── tabs.tsx, label.tsx                  # Recently added
│       └── ...
├── lib/
│   ├── constants.ts                            # COMPANIES array, CompanySlug type
│   ├── db.ts                                   # PostgreSQL connection pool (singleton)
│   ├── schema.ts                               # All CREATE TABLE statements + migrations
│   ├── storage.ts                              # GCP Cloud Storage upload/download
│   ├── utils.ts                                # cn() className utility
│   ├── upload-config.ts                        # Per-company upload tab configuration
│   ├── analytics/                              # Analytics aggregation (read-only)
│   │   ├── utils.ts                            # Time ranges, YoY calc, company validation
│   │   ├── by-scope.ts                         # Scope 1+2 aggregation
│   │   ├── by-source.ts                        # Source breakdown aggregation
│   │   ├── by-process.ts                       # Work center aggregation
│   │   └── by-product.ts                       # Product intensity aggregation
│   ├── emissions/                              # Emission calculation engine
│   │   ├── constants.ts                        # Meta Engitech hardcoded constants (IPCC)
│   │   ├── constants-loader.ts                 # DB → fallback constant loading
│   │   ├── calculate.ts                        # Meta Engitech calculation logic
│   │   ├── engine.ts                           # Meta Engitech DB orchestrator
│   │   ├── types.ts                            # Meta Engitech types
│   │   └── shakambhari/
│   │       ├── constants.ts                    # Shakambhari constants + CARBON_CONTENT_MAP
│   │       ├── calculate.ts                    # Shakambhari calculation logic
│   │       ├── engine.ts                       # Shakambhari DB orchestrator
│   │       └── types.ts                        # Shakambhari types
│   └── parsers/                                # Excel file parsers
│       ├── utils.ts                            # Shared: buildColumnMap, resolveColumns, toNumberOrNull
│       ├── meta-engitech-pune.ts               # Routing/BOM parser (streaming)
│       ├── consumption/
│       │   ├── index.ts                        # Parser registry
│       │   └── meta-engitech-pune.ts           # Consumption parser (header-based)
│       └── production/
│           ├── index.ts                        # Parser registry
│           ├── types.ts                        # ProductionRecord, ProductionSource
│           └── shakambhari.ts                  # Production parser (grouped rows)
├── CALCULATIONS.md                             # Formula documentation
├── DECISIONS.md                                # Architectural decision log
├── FINAL_STEPS.md                              # Remaining frontend tasks
├── FRONTEND_PLAN.md                            # Frontend build plan
├── V1_FLOW.md                                  # System flow + build phases
├── STEP_PROMPT_TEMPLATE.md                     # Prompt template for Claude sessions
├── shakambhari_plan.md                         # Shakambhari implementation plan
└── Data_structure_for_reference.txt            # DB data dumps for reference
```

---

## 4. The Two Companies & Their Calculation Models

### Meta Engitech Pune — Fuel Consumption Intensity Model

**Industry:** Steel tube manufacturing
**What they upload:**
1. **Routing data** (one-time, updated occasionally) — Bill of Materials showing which work centers each product passes through
2. **Monthly consumption data** — Electricity (kWh), LPG (kg), Diesel (litres) consumed per work center, plus production tonnage

**Calculation approach:** Energy consumption per tonne of production × standard emission factors

**Unit of output:** tCO₂e/tonne (emission **intensity** — how much CO₂ per unit of product)

**Work centers (~20-50):** WSLT1 (Big Slitter), WTM1 (Tube Mill 1), WGALV (Galvanizing), QWKC (Quality Work Center), etc.

**Products (~5,000-10,000):** Steel tube variants identified by product IDs like TS35303000001F

**Scope split:**
- Scope 1 (Direct) = LPG + Diesel combustion emissions
- Scope 2 (Indirect) = Purchased electricity emissions

### Shakambhari — Carbon Mass Balance Model

**Industry:** Ferro alloy smelting
**What they upload:**
1. **Production data** (single Excel file per period) — Daily records with embedded routing + all input materials, byproducts, and electricity

**Calculation approach:** Carbon entering in raw materials minus carbon retained in products/byproducts = carbon emitted. Then × 44/12 (molecular weight of CO₂/C).

**Unit of output:** tCO₂e (absolute emissions per production order)

**Work centers (~6-8):** S1_SFUR5, S1_SFUR6, S1_MRPU1, etc.

**Products (~10-20):** Silico Manganese (55-60) Prime, Ferro Manganese (75-80) Prime, etc.

**Scope split:**
- Scope 1 (Direct) = Net carbon balance (input carbon - output carbon)
- Scope 2 (Indirect) = Mix Power (electricity) × grid factor

**Key difference:** Meta Engitech only tracks 3 energy sources (electricity, LPG, diesel). Shakambhari tracks 40+ materials, each with its own carbon content fraction.

---

## 5. Database Schema

### Table: `companies`
```sql
CREATE TABLE companies (
  slug TEXT PRIMARY KEY,              -- "meta_engitech_pune", "shakambhari"
  clerk_user_id TEXT,                 -- Clerk auth user (currently "anonymous")
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `routing_data`
Stores Meta Engitech's Bill of Materials — which work centers each product passes through.
```sql
CREATE TABLE routing_data (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE UNIQUE,
  data JSONB NOT NULL,                -- { products: [{ productId, rows: [{ materialType, materials, material, workCenter, operationShortText }] }] }
  original_file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```
**JSONB `data` shape:**
```json
{
  "products": [
    {
      "productId": "TS35303000001F",
      "rows": [
        {
          "materialType": "BOM Comp",
          "materials": "SLS3530142501",
          "material": "SLS3530142501",
          "workCenter": "WSLT1",
          "operationShortText": "Big Slitter-2 (U-1)"
        },
        { "workCenter": "WTM2", "operationShortText": "Tube Mill-2 (U-1)", ... },
        { "workCenter": "IDFINR", ... }
      ]
    }
  ]
}
```

### Table: `consumption_data`
Monthly energy/fuel consumption per work center for Meta Engitech.
```sql
CREATE TABLE consumption_data (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  data JSONB NOT NULL,                -- { "WSLT1": {...}, "WTM1": {...}, ... }
  original_file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, year, month)
);
```
**JSONB `data` shape:** Object keyed by work center code:
```json
{
  "WSLT1": {
    "sequence": 1,
    "description": "Big Slitter-2 (U-1)",
    "productionMT": 1250,
    "totalEnergyKWh": 2721,
    "energyMSEBKWh": 1800,
    "energySolarKWh": 921,
    "lpgConsumptionKg": null,
    "dieselConsumptionLtrs": null,
    "dateValue": "01-05-2025",
    "uomProduction": "MT",
    "uomElectEnergy": "KWh",
    "uomLPG": "Kg",
    "uomDiesel": "Ltrs"
  },
  "WTM1": { ... }
}
```

### Table: `production_data_shakambhari`
Daily production records with embedded source materials.
```sql
CREATE TABLE production_data_shakambhari (
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
  sources JSONB NOT NULL DEFAULT '[]',  -- Array of input/output materials
  original_file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, date, work_center, product_id, order_no)
);
-- Index:
CREATE INDEX idx_prod_shak_lookup ON production_data_shakambhari (company_slug, year, month);
```
**JSONB `sources` shape:**
```json
[
  {
    "compMat": "11000032",
    "compName": "Manganese Ore (30-32) Lumps",
    "compUom": "TO",
    "consumedQty": 37.85,
    "byproductQty": 0,
    "consumedVal": 359430.79,
    "byproductVal": 0
  },
  {
    "compMat": "70000002",
    "compName": "Mix Power",
    "compUom": "KWH",
    "consumedQty": 172939,
    "byproductQty": 0,
    "consumedVal": 1202064,
    "byproductVal": 0
  }
]
```

### Table: `emission_by_process_meta_engitech`
Calculated emission intensities per work center per month.
```sql
CREATE TABLE emission_by_process_meta_engitech (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  work_center TEXT NOT NULL,
  description TEXT,
  production_mt NUMERIC DEFAULT 0,
  electricity_intensity NUMERIC DEFAULT 0,   -- tCO₂/tonne
  lpg_intensity NUMERIC DEFAULT 0,           -- tCO₂/tonne
  diesel_intensity NUMERIC DEFAULT 0,        -- tCO₂/tonne
  total_intensity NUMERIC DEFAULT 0,         -- sum of above 3
  scope1_intensity NUMERIC DEFAULT 0,        -- LPG + Diesel
  scope2_intensity NUMERIC DEFAULT 0,        -- Electricity
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, year, month, work_center)
);
```

### Table: `emission_by_product_meta_engitech`
Calculated emission intensities per product per month.
```sql
CREATE TABLE emission_by_product_meta_engitech (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  work_center_count INTEGER DEFAULT 0,
  matched_work_center_count INTEGER DEFAULT 0,
  electricity_intensity NUMERIC DEFAULT 0,
  lpg_intensity NUMERIC DEFAULT 0,
  diesel_intensity NUMERIC DEFAULT 0,
  total_intensity NUMERIC DEFAULT 0,
  scope1_intensity NUMERIC DEFAULT 0,
  scope2_intensity NUMERIC DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, year, month, product_id)
);
-- Index:
CREATE INDEX idx_emission_by_product_meta_engitech_lookup
  ON emission_by_product_meta_engitech (company_slug, year, month, total_intensity DESC);
```

### Table: `emission_results_shakambhari`
Calculated emissions per production record with source breakdowns.
```sql
CREATE TABLE emission_results_shakambhari (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  work_center TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT,
  order_no TEXT NOT NULL,
  production_qty NUMERIC NOT NULL DEFAULT 0,
  production_uom TEXT DEFAULT 'TO',
  total_input_co2e NUMERIC NOT NULL DEFAULT 0,
  total_output_co2e NUMERIC NOT NULL DEFAULT 0,
  electricity_co2e NUMERIC NOT NULL DEFAULT 0,
  net_scope1_co2e NUMERIC NOT NULL DEFAULT 0,    -- inputs - outputs
  net_total_co2e NUMERIC NOT NULL DEFAULT 0,     -- scope1 + electricity
  source_breakdowns JSONB NOT NULL DEFAULT '[]',
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, date, work_center, product_id, order_no)
);
-- Indexes:
CREATE INDEX idx_emission_shak_lookup ON emission_results_shakambhari (company_slug, year, month);
CREATE INDEX idx_emission_shak_net ON emission_results_shakambhari (company_slug, year, month, net_total_co2e DESC);
```
**JSONB `source_breakdowns` shape:**
```json
[
  {
    "compMat": "11000044",
    "compName": "Lam Coke",
    "compUom": "TO",
    "quantity": 24.5,
    "category": "input",
    "carbonContent": 0.82,
    "carbonEmission": 20.09,
    "co2e": 73.663
  },
  {
    "compMat": "70000002",
    "compName": "Mix Power",
    "compUom": "KWH",
    "quantity": 172939,
    "category": "electricity",
    "carbonContent": null,
    "carbonEmission": 0,
    "co2e": 103.418
  },
  {
    "compMat": "70000024",
    "compName": "Silico Manganese (55-60) Prime",
    "compUom": "TO",
    "quantity": 35,
    "category": "main_product",
    "carbonContent": 0.0275,
    "carbonEmission": 0.9625,
    "co2e": 3.529
  }
]
```

### Table: `emission_constants`
Quarterly emission factors, editable by admin.
```sql
CREATE TABLE emission_constants (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  constants JSONB NOT NULL,
  original_file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_slug, year, quarter)
);
-- Index:
CREATE INDEX idx_emission_constants_lookup ON emission_constants (company_slug, year DESC, quarter DESC);
```
**JSONB `constants` shape (Meta Engitech):**
```json
{
  "type": "meta_engitech",
  "electricity_ef": 0.000598,
  "lpg_ncv": 47.3,
  "lpg_ef": 63.1,
  "diesel_ncv": 43,
  "diesel_ef": 74.2,
  "diesel_density": 0.832
}
```
**JSONB `constants` shape (Shakambhari):**
```json
{
  "type": "shakambhari",
  "electricity_ef": 0.000598,
  "co2_per_carbon": 3.6667,
  "carbon_content_map": {
    "11000032": { "compName": "Manganese Ore (30-32) Lumps", "carbonContent": 0.3305 },
    "11000044": { "compName": "Lam Coke", "carbonContent": 0.82 },
    ...
  }
}
```

### Table: `file_uploads`
Audit trail for all uploaded files.
```sql
CREATE TABLE file_uploads (
  id SERIAL PRIMARY KEY,
  company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
  upload_type TEXT NOT NULL,        -- "routing" | "consumption" | "production" | "constants"
  file_name TEXT,
  file_url TEXT,                    -- gs:// URL in GCS
  file_size_bytes TEXT,
  year TEXT,
  month TEXT,
  quarter TEXT,
  status TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index:
CREATE INDEX idx_file_uploads_lookup ON file_uploads (company_slug, upload_type, uploaded_at DESC);
```

---

## 6. Data Flow: Upload → Parse → Calculate → Store → Display

### Meta Engitech Flow
```
STEP 1: Routing Upload (one-time / semi-permanent)
  Excel file → POST /api/routing/upload
    → Parse with streaming ExcelJS (lib/parsers/meta-engitech-pune.ts)
    → Upload original to GCS
    → Store parsed JSONB in routing_data table
    → Log in file_uploads

STEP 2: Monthly Consumption Upload
  Excel file → POST /api/consumption/upload (with year, month params)
    → Parse with ExcelJS (lib/parsers/consumption/meta-engitech-pune.ts)
    → Upload original to GCS
    → Store parsed JSONB in consumption_data table
    → Log in file_uploads
    → Fire-and-forget: triggerEmissionCalculation()

STEP 3: Emission Calculation (automatic after Step 2, or manual via API)
  lib/emissions/engine.ts → triggerEmissionCalculation(companySlug, year, month)
    → Load routing_data from DB
    → Load consumption_data from DB for the month
    → Load constants (DB → fallback to hardcoded)
    → Call calculateAll(routing, consumption, constants)
      → Step 3a: calculateByProcess() — per work center intensities
      → Step 3b: calculateByProduct() — per product = sum of WC intensities
    → Write to emission_by_process_meta_engitech (delete-then-insert, transactional)
    → Write to emission_by_product_meta_engitech (delete-then-insert, transactional, unnest for bulk)

STEP 4: Dashboard Display
  Analytics API routes → Read from emission tables → Aggregate (SUM, AVG, GROUP BY)
  → Return to frontend → Render charts + tables
```

### Shakambhari Flow
```
STEP 1: Production Upload (monthly / periodic)
  Excel file → POST /api/production/upload (dates extracted from data)
    → Parse with ExcelJS (lib/parsers/production/shakambhari.ts)
    → Upload original to GCS
    → Transaction: DELETE existing records for affected dates, INSERT new ones
    → Store in production_data_shakambhari table
    → Log in file_uploads
    → Fire-and-forget: triggerShakambhariEmissionCalculation() for each affected month

STEP 2: Emission Calculation (automatic after Step 1, or manual via API)
  lib/emissions/shakambhari/engine.ts → triggerShakambhariEmissionCalculation(slug, year, month)
    → Load production records from DB for the month
    → Load constants (DB → fallback to hardcoded)
    → Call calculateAll(records, constants)
      → For each production record:
        → Classify each source (input / byproduct / main_product / electricity)
        → Calculate CO₂e per source
        → Aggregate: netScope1 = inputs - outputs, total = scope1 + electricity
    → Write to emission_results_shakambhari (delete-then-insert, transactional, unnest)

STEP 3: Dashboard Display
  Same analytics API routes → Read from emission_results_shakambhari → Aggregate → Display
```

### Constants Update Flow
```
Admin updates emission constants:
  → Download template: GET /api/constants/template
  → Edit Excel file with new values
  → Upload: POST /api/constants/upload
    → Parse Excel, store in emission_constants table
    → Check if emission data exists for that quarter
    → If yes: prompt admin to recalculate
  → Recalculate: POST /api/emissions/recalculate
    → Find months with data in the quarter (or forward)
    → Re-trigger calculation engine for each month
    → Updated constants are used in the recalculation
```

---

## 7. Parsers (Excel → Structured Data)

### Shared Utilities (`lib/parsers/utils.ts`)

| Function | Purpose |
|----------|---------|
| `buildColumnMap(headerRow)` | Build case-insensitive, whitespace-collapsed header → column index map |
| `resolveColumns(colMap, expected, opts?)` | Map field names to column indices. Supports aliases and optional columns. Throws on missing required columns. |
| `toNumberOrNull(value)` | Convert Excel cell to number. Handles comma-formatted strings like "2,303,000.00". Returns null for empty/non-numeric. |
| `toISODate(value)` | Convert Date objects, "M/DD/YY", "MM/DD/YYYY" to "YYYY-MM-DD" |
| `toDateStringDDMMYYYY(value)` | Convert to "DD-MM-YYYY" (Meta Engitech legacy format) |

### Routing Parser — `lib/parsers/meta-engitech-pune.ts`

- **Input:** Excel file (~25-30MB), uses **streaming reader** (ExcelJS.stream.xlsx.WorkbookReader) to avoid memory issues
- **Headers (row 1):** Material Type, Materials, Material, Work Center, Operation Short Text
- **Logic:** Products separated by empty rows. FG rows (finished goods) become product IDs. Subsequent rows are routing steps.
- **Output:** `{ products: [{ productId, rows: [{ materialType, materials, material, workCenter, operationShortText }] }] }`

### Consumption Parser — `lib/parsers/consumption/meta-engitech-pune.ts`

- **Input:** Excel/CSV file with monthly consumption data
- **Headers (row 3):** Sequence, WorkCenter, Description, Production in MT, Total Energy in KWh, Energy MSEB KWh, Energy Solar KWh, LPG consumption in Kg, Diesel consumption in Ltrs, DateVAlue
- **Aliases:** "Energy in KWh" → "Total Energy in KWh", "Date" → "DateVAlue" (handles format variations between months)
- **Optional columns:** energyMSEB, energySolar (null when not present, e.g. April format)
- **Validation:** First data row's sequence must be 1; throws on duplicate work center codes
- **Output:** `Record<string, WorkCenterConsumption>` (keyed by work center code)

### Production Parser — `lib/parsers/production/shakambhari.ts`

- **Input:** Excel file with daily production records
- **Headers (row 1):** POSTING DATE, PLANT, PROD MAT, ORDER NO, PRODUCTION VERSION, PROD MATDESC, PROD UOM, WORK CENTER, PRODUCTION QTY, COMP MAT, COMP MATDESC, COMP UOM, CONSUMED QTY, BYPRODUCT QTY, CONSUMED VAL, BYPRODUCT VAL
- **Skipped columns:** PRODUCTION VERSION DESC., PROD GROUP, ORD TYPE, PRODUCTION VAL, COMP GROUP, COMP GROUPDESC
- **Logic:** Rows grouped by PROD MAT. When PROD MAT is populated → new product group. Subsequent rows without PROD MAT are component/source rows belonging to the current product.
- **Edge case:** Product header row may also contain COMP MAT data (first source on same row)
- **Output:** `ProductionRecord[]` — each with `sources: ProductionSource[]`

### Parser Registries

```typescript
// lib/parsers/consumption/index.ts
getConsumptionParser(companySlug: string): ConsumptionParser

// lib/parsers/production/index.ts
getProductionParser(companySlug: string): ProductionParser
```
Both throw if the company slug has no matching parser.

---

## 8. Emission Calculation Engine — Meta Engitech

**Files:** `lib/emissions/constants.ts`, `calculate.ts`, `engine.ts`, `types.ts`

### Constants (`lib/emissions/constants.ts`)

| Constant | Value | Source |
|----------|-------|--------|
| `ELECTRICITY_EF` | `0.000598 tCO₂/kWh` | CEA India grid factor (0.598 kg/kWh ÷ 1000) |
| `LPG_NCV` | `47.3 MJ/kg` | IPCC Net Calorific Value |
| `LPG_EF` | `63.1 kg CO₂/GJ` | IPCC Emission Factor |
| `DIESEL_NCV` | `43 MJ/kg` | IPCC |
| `DIESEL_EF` | `74.1 kg CO₂/GJ` | IPCC |
| `DIESEL_DENSITY` | `0.832 kg/L` | Standard conversion |

### Formulas

**Step 1: Per Work Center** (`calculateWorkCenterEmission`)

```
electricity_intensity = (totalEnergyKWh / productionMT) × electricity_ef
lpg_intensity         = (lpgConsumptionKg / productionMT) × lpg_ncv × lpg_ef / 1,000,000
diesel_intensity      = (dieselConsumptionLtrs / productionMT) × diesel_ncv × diesel_ef × diesel_density / 1,000,000

scope1_intensity = lpg_intensity + diesel_intensity
scope2_intensity = electricity_intensity
total_intensity  = scope1_intensity + scope2_intensity
```

All values in **tCO₂e per tonne of production**. If `productionMT = 0`, all intensities = 0.

**Step 2: Per Product** (`calculateByProduct`)

```
product.electricity = Σ wc.electricity_intensity  (for all work centers in routing)
product.lpg         = Σ wc.lpg_intensity
product.diesel      = Σ wc.diesel_intensity
product.scope1      = product.lpg + product.diesel
product.scope2      = product.electricity
product.total       = product.scope1 + product.scope2
```

This is "Approach A" — sum of individual WC intensities. Each product's intensity is the sum of the intensities of every work center it passes through (from the routing/BOM data).

### Types

```typescript
interface WorkCenterEmission {
  workCenter: string;
  description: string;
  productionMT: number;
  electricityIntensity: number;
  lpgIntensity: number;
  dieselIntensity: number;
  totalIntensity: number;
  scope1Intensity: number;
  scope2Intensity: number;
}

interface ProductEmission {
  productId: string;
  workCenterCount: number;
  matchedWorkCenterCount: number;
  electricityIntensity: number;
  lpgIntensity: number;
  dieselIntensity: number;
  totalIntensity: number;
  scope1Intensity: number;
  scope2Intensity: number;
}

interface EmissionResults {
  byProcess: WorkCenterEmission[];
  byProduct: ProductEmission[];
}
```

### Engine (`lib/emissions/engine.ts`)

`triggerEmissionCalculation(companySlug, year, month)`:
1. Reads `routing_data` and `consumption_data` from DB
2. Loads constants via `loadMetaEngitechConstants(year, month)`
3. Calls `calculateAll(routing, consumption, constants)`
4. Writes `byProcess` results — delete old rows for month, insert new ones (single INSERT)
5. Writes `byProduct` results — delete old rows, batch INSERT with `unnest()` (~5,000-10,000 rows)
6. Both writes are transactional (BEGIN/COMMIT/ROLLBACK)

---

## 9. Emission Calculation Engine — Shakambhari

**Files:** `lib/emissions/shakambhari/constants.ts`, `calculate.ts`, `engine.ts`, `types.ts`

### Constants (`lib/emissions/shakambhari/constants.ts`)

| Constant | Value | Notes |
|----------|-------|-------|
| `ELECTRICITY_EF` | `0.000598 tCO₂/kWh` | Same CEA India grid factor |
| `CO2_PER_CARBON` | `44/12 = 3.667` | Molecular weight ratio CO₂/C |
| `CARBON_CONTENT_MAP` | ~40+ materials | Map of `compMat` → `{ compName, carbonContent }`. **Values are placeholders** awaiting client confirmation. |

**Sample carbon content values:**
| Material | compMat | Carbon Content |
|----------|---------|---------------|
| Lam Coke | 11000044 | 0.82 |
| Steam Coal (Non Coking) | 11000003 | 0.465 |
| Manganese Ore (30-32) Lumps | 11000032 | 0.3305 |
| Quartz | 11000034 | 0.0 |
| Silico Manganese (55-60) Prime | 70000024 | 0.0275 |
| Ferro Manganese (75-80) Prime | 70000057 | 0.08 |
| Disposal Slag | 75000015 | 0.0 |

### Source Classification (`classifySource`)

Each source in a production record is classified:

| Category | Rule | Quantity Used |
|----------|------|---------------|
| `electricity` | `compUom === "KWH"` | `consumedQty` |
| `main_product` | `compMat === parentProductId AND consumedQty === 0 AND byproductQty === 0` | Parent record's `productionQty` |
| `byproduct` | `byproductQty > 0` | `byproductQty` |
| `input` | Everything else (raw materials consumed) | `consumedQty` |

### Formulas

**For electricity:**
```
co2e = consumedQty × ELECTRICITY_EF (0.000598)
```

**For materials (input / byproduct / main_product):**
```
carbonEmission = quantity × carbonContent
co2e = carbonEmission × CO2_PER_CARBON (44/12 = 3.667)
```

**Per production record aggregation:**
```
totalInputCO2e  = Σ co2e for all "input" sources
totalOutputCO2e = Σ co2e for all "main_product" + "byproduct" sources
electricityCO2e = Σ co2e for all "electricity" sources

netScope1CO2e   = totalInputCO2e − totalOutputCO2e
netTotalCO2e    = netScope1CO2e + electricityCO2e
```

**Key concept:** Carbon in raw materials → some stays in product/byproduct (output), the rest is emitted to atmosphere (process emissions). This is the mass balance approach.

### Missing Carbon Content Handling

When a material's `compMat` is not in `CARBON_CONTENT_MAP`:
- Calculation continues (does NOT throw)
- Material treated as 0 emission
- Warning added: `"Missing carbon content for {compMat} ({compName}) in product X on date Y at WC Z"`
- API returns both `resultCount` and `warnings[]`

### Types

```typescript
interface SourceEmissionResult {
  compMat: string;
  compName: string;
  compUom: string;
  quantity: number;
  category: "input" | "byproduct" | "main_product" | "electricity";
  carbonContent: number | null;
  carbonEmission: number;
  co2e: number;
}

interface ProductEmissionResult {
  date: string;
  year: number;
  month: number;
  workCenter: string;
  productId: string;
  productName: string;
  orderNo: string;
  productionQty: number;
  productionUom: string;
  totalInputCO2e: number;
  totalOutputCO2e: number;
  electricityCO2e: number;
  netScope1CO2e: number;
  netTotalCO2e: number;
  sourceBreakdowns: SourceEmissionResult[];
}

interface ShakambhariEmissionResults {
  results: ProductEmissionResult[];
  warnings: string[];
}
```

### Engine (`lib/emissions/shakambhari/engine.ts`)

`triggerShakambhariEmissionCalculation(companySlug, year, month)`:
1. Reads `production_data_shakambhari` for the month
2. Loads constants via `loadShakambhariConstants(year, month)`
3. Calls `calculateAll(records, constants)`
4. Writes to `emission_results_shakambhari` — delete old rows for month, batch INSERT with `unnest()`
5. Returns `{ resultCount, warnings }`

---

## 10. Emission Constants Management

### Constants Loader (`lib/emissions/constants-loader.ts`)

**Three-tier fallback chain:**
1. **DB exact match** — Query `emission_constants` for exact company/year/quarter
2. **DB previous quarter** — Try the most recent previous quarter in the DB
3. **Hardcoded fallback** — Use values from `lib/emissions/constants.ts` or `lib/emissions/shakambhari/constants.ts`

**Functions:**
```typescript
loadMetaEngitechConstants(year, month): MetaEngitechConstants
loadShakambhariConstants(year, month): ShakambhariConstants
getDefaultConstants(companySlug): MetaEngitechConstants | ShakambhariConstants
```

**MetaEngitechConstants:** `{ electricity_ef, lpg_ncv, lpg_ef, diesel_ncv, diesel_ef, diesel_density }`
**ShakambhariConstants:** `{ electricity_ef, co2_per_carbon, carbon_content_map }`

### API Endpoints for Constants

- `GET /api/constants?company=X&year=Y&quarter=Q` — Fetch with fallback
- `PUT /api/constants` — Create/update constants
- `GET /api/constants/template?company=X&year=Y&quarter=Q` — Download pre-filled Excel template
- `POST /api/constants/upload` — Upload modified Excel, parse, and store

### Recalculation After Constants Change

`POST /api/emissions/recalculate`:
- **Body:** `{ company, year, quarter, scope: "quarter" | "forward" }`
- "quarter" = recalculate only months in that quarter that have data
- "forward" = recalculate from that quarter through all months with data going forward
- Fires calculation engine for each affected month (fire-and-forget)

---

## 11. Analytics Layer (Read-Only Aggregation)

These functions **do NOT recalculate** emissions. They read pre-calculated results and aggregate for display.

### Utility Functions (`lib/analytics/utils.ts`)

| Function | Purpose |
|----------|---------|
| `validateCompany(slug)` | Returns `{ isValid, isMetaEngitech, isShakambhari }` |
| `parseTimeRange(period)` | Maps Q1→[1,2,3], Q2→[4,5,6], Q3→[7,8,9], Q4→[10,11,12], FULL_YEAR→[1-12] |
| `calculateYoYChange(current, previous)` | `{ percent: (curr-prev)/prev × 100, absolute: curr-prev }` |
| `getPreviousQuarter(year, period)` | Q1→Q4 prev year, Q2→Q1, Q3→Q2, Q4→Q3, FULL→prev year |
| `formatYoYChange(change, unit)` | "+12% (+403 tCO₂e)" or "N/A" |
| `groupByQuarter(data)` | Groups records into Q1/Q2/Q3/Q4 buckets |

### By Scope (`lib/analytics/by-scope.ts`)

| Company | Table | Scope 1 | Scope 2 |
|---------|-------|---------|---------|
| Meta Engitech | `emission_by_product_meta_engitech` | `SUM(scope1_intensity)` | `SUM(scope2_intensity)` |
| Shakambhari | `emission_results_shakambhari` | `SUM(net_scope1_co2e)` | `SUM(electricity_co2e)` |

Returns: `{ current: { scope1, scope2 }, previous, yoyChange: { scope1: YoYChange, scope2: YoYChange } }`

### By Source (`lib/analytics/by-source.ts`)

| Company | Materials & Fuels | Energy | Breakdown |
|---------|-------------------|--------|-----------|
| Meta Engitech | `SUM(lpg_intensity + diesel_intensity)` | `SUM(electricity_intensity)` | LPG, Diesel, Electricity (3 entries) |
| Shakambhari | `SUM(net_scope1_co2e)` | `SUM(electricity_co2e)` | Reads `source_breakdowns` JSONB → top 7 materials + "Others" bucket |

### By Process (`lib/analytics/by-process.ts`)

| Company | Table | Aggregation |
|---------|-------|-------------|
| Meta Engitech | `emission_by_process_meta_engitech` | `SUM(total_intensity) GROUP BY work_center, description` |
| Shakambhari | `emission_results_shakambhari` | `SUM(net_total_co2e) GROUP BY work_center` |

Returns: `{ data: ProcessEmission[], totalEmissions }` sorted by emissions DESC

### By Product (`lib/analytics/by-product.ts`)

| Company | Table | Intensity Calculation |
|---------|-------|----------------------|
| Meta Engitech | `emission_by_product_meta_engitech` | `AVG(total_intensity)` already per-unit |
| Shakambhari | `emission_results_shakambhari` | `SUM(net_total_co2e) / SUM(production_qty)` computed at query time |

Returns: `{ data: ProductEmission[], avgIntensity, totalProducts }` paginated

---

## 12. API Routes Reference

### Emission Analytics

| Method | Endpoint | Query Params | Returns |
|--------|----------|--------------|---------|
| GET | `/api/emissions/by-scope` | `company`, `year`, `period` | Scope 1+2 with YoY |
| GET | `/api/emissions/by-source` | `company`, `year`, `period` | Source breakdown with YoY |
| GET | `/api/emissions/by-process` | `company`, `year`, `period` | Work center emissions with YoY |
| GET | `/api/emissions/by-product` | `company`, `year`, `period`, `page`, `pageSize` | Product intensities (paginated) |
| GET | `/api/emissions/summary` | `companySlug`, `year`, `month` | Summary stats (Meta Engitech only) |
| GET | `/api/emissions/available-periods` | `company` | Available year/quarter combinations |

### Calculation Triggers

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/api/emissions/calculate` | `{ companySlug, year, month }` | Calculation result |
| POST | `/api/emissions/shakambhari/calculate` | `{ companySlug, year, month }` | `{ resultCount, warnings }` |
| POST | `/api/emissions/recalculate` | `{ company, year, quarter, scope }` | `{ recalculatedCount, months }` |

### Upload Endpoints

| Method | Endpoint | Content-Type | Params |
|--------|----------|-------------|--------|
| POST | `/api/routing/upload` | multipart/form-data | `file`, `companySlug` |
| POST | `/api/consumption/upload` | multipart/form-data | `file`, `companySlug`, `year`, `month` |
| POST | `/api/production/upload` | multipart/form-data | `file`, `companySlug` |

### Constants Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/constants` | Fetch constants (with fallback) |
| PUT | `/api/constants` | Create/update constants |
| GET | `/api/constants/template` | Download pre-filled Excel template |
| POST | `/api/constants/upload` | Upload constants Excel |

### Upload History

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/uploads` | List upload history |
| GET | `/api/uploads/download` | Generate signed download URL |

### Product Flows

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/product-flows` | Meta Engitech product list (paginated) |
| GET | `/api/product-flows/[productId]` | Meta Engitech flow diagram data |
| GET | `/api/product-flows-shakambhari` | Shakambhari product list (paginated) |
| GET | `/api/product-flows-shakambhari/[productId]` | Shakambhari flow diagram data |

### Setup

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/setup` | Initialize DB schema + backfill file_uploads |

---

## 13. Frontend Architecture

### Layout Structure

```
app/dashboard/layout.tsx
├── <SidebarProvider>
│   ├── <AppSidebar />                     # Left sidebar navigation
│   └── <SidebarInset>
│       ├── <header>                       # Top bar
│       │   ├── <SidebarTrigger />         # Mobile hamburger menu
│       │   ├── <Separator />
│       │   ├── <CompanySelector />        # Company dropdown
│       │   └── User avatar placeholder
│       └── <main className="flex-1 p-6">
│           └── {children}                 # Page content
```

### Navigation

**Main Menu:**
- Overview → `/dashboard`
- Analytics → `/dashboard/analytics`
- Product Flows → `/dashboard/product-flows`

**Data Management (Admin):**
- Data Upload → `/dashboard/data-upload`

### Company Context

- Selected company stored in **URL search params**: `?company=meta_engitech_pune`
- All pages read `company` from `useSearchParams().get("company")`
- Sidebar preserves `?company=` param when navigating between pages
- CompanySelector updates the URL param on change

### Company List (hardcoded)

```typescript
const COMPANIES = [
  { slug: "meta_engitech_pune", label: "Meta Engitech Pune" },
  { slug: "shakambhari", label: "Shakambhari" },
];
```

---

## 14. Frontend Pages & Components

### Overview Page (`app/dashboard/page.tsx`)

**What it shows:**
- Year/Quarter selector (auto-detects latest quarter with data)
- Scope 1 + Scope 2 summary cards (flame + lightning icons, tCO₂e values)
- Dropdown toggle: Process Wise vs Product Wise emissions
- Ranked emissions table with horizontal bar indicators

**API calls:**
- `GET /api/emissions/by-scope?company=X&year=Y&period=Q`
- `GET /api/emissions/by-process?company=X&year=Y&period=Q`
- `GET /api/emissions/by-product?company=X&year=Y&period=Q&page=1&pageSize=1000`

**Components used:** QuarterSelector, ScopeCards, EmissionsRankedTable

### Analytics Page (`app/dashboard/analytics/page.tsx`)

**What it shows:**
- View selector: Scope / Source / Process / Product
- Year selector (2024-2026) + Period selector (Full Year, Q1-Q4)
- Dynamically renders one of 4 analytics view components

**Analytics view components (under `components/analytics/`):**

| Component | What it displays |
|-----------|-----------------|
| EmissionsByScope | Scope 1 + 2 bar chart + YoY comparison table |
| EmissionsBySource | Materials & Fuels vs Energy chart + source breakdown table |
| EmissionsByProcess | Per work center bar chart + ranked table with YoY |
| EmissionsByProduct | Per product intensity table with pagination (10/20/30 page sizes) |

Each component makes its own API call and handles its own loading/error states.

### Product Flows List (`app/dashboard/product-flows/page.tsx`)

**What it shows:**
- Product count + search bar
- Table: #, Product ID, (Work Centers for Meta | Product Name for Shakambhari), View Flow button
- Pagination controls

**Company-specific logic:**
- Meta Engitech: calls `/api/product-flows`, shows "Work Centers" column
- Shakambhari: calls `/api/product-flows-shakambhari`, shows "Product Name" column
- Search fetches all products (pageSize=10000) and filters client-side

### Product Flow Detail (`app/dashboard/product-flows/[productId]/page.tsx`)

**What it shows:**
- Back button + product metadata
- Month/Year selector dropdown
- "Show Details" / "Hide Details" toggle
- React Flow diagram with custom nodes (material, work center, fuel)

**Shakambhari-only metadata:** product name, work center, production date, production quantity

**Components:** FlowDiagram (React Flow wrapper), MaterialNode, WorkCenterNode, FuelNode

**Layout:** Meta Engitech uses top-to-bottom (TB) dagre layout, Shakambhari uses left-to-right (LR)

### Data Upload Page (`app/dashboard/data-upload/page.tsx`)

**What it shows:** Tabbed interface with company-specific tabs:
- **Meta Engitech tabs:** Routing, Consumption, Constants, Sales (placeholder)
- **Shakambhari tabs:** Consumption (actually production), Constants, Sales (placeholder)

**Components:**

| Component | File | Purpose |
|-----------|------|---------|
| RoutingUploadForm | `components/data-upload/routing-upload-form.tsx` | Large file upload with XHR progress bar (25-30MB files) |
| UnifiedConsumptionForm | `components/data-upload/unified-consumption-form.tsx` | Smart form — Meta needs year/month selectors, Shakambhari extracts dates automatically |
| ConstantsEditor | `components/data-upload/constants-editor.tsx` | Download template → edit → upload → recalculate prompt |
| UploadHistory | `components/data-upload/upload-history.tsx` | Audit trail table with download buttons (signed URLs) |

### Reusable Components

| Component | File | Props/Interface |
|-----------|------|-----------------|
| QuarterSelector | `components/overview/quarter-selector.tsx` | Fetches available periods, auto-selects latest, `onChange(year, quarter)` |
| ScopeCards | `components/overview/scope-cards.tsx` | `{ scope1, scope2, loading }` — two cards with icons |
| EmissionsRankedTable | `components/overview/emissions-ranked-table.tsx` | `{ data: RankedEmission[], unit }` — ranked table with orange bar indicators |
| FlowDiagram | `components/product-flow/flow-diagram.tsx` | React Flow wrapper with Background, Controls, MiniMap |
| CompanySelector | `components/company-selector.tsx` | Dropdown that reads/writes `?company=` URL param |
| AppSidebar | `components/app-sidebar.tsx` | Navigation with active link detection, preserves company param |

---

## 15. Storage & File Management

### GCP Cloud Storage (`lib/storage.ts`)

```typescript
uploadToGCS(buffer: Buffer, destination: string): Promise<string>   // Returns gs:// URL
getSignedDownloadUrl(gcsUrl: string): Promise<string>               // 15-minute signed HTTPS URL
formatUploadDate(date?: Date): string                               // "25-Feb-2026"
```

**File path patterns:**
- Routing: `routing/{company_slug}/{filename}`
- Consumption: `consumption_data/{company_slug}/{year}_{month}`
- Production: `production_data/{company_slug}/{timestamp}_{filename}`
- Constants: `constants/{company_slug}/{year}_Q{quarter}_{timestamp}.xlsx`

**Configuration:** `GCP_SERVICE_ACCOUNT_KEY_PATH` and `GCP_BUCKET_NAME` env vars

### Database Connection (`lib/db.ts`)

- Singleton `Pool` stored on `globalThis` (survives Next.js hot-reload)
- Max 10 connections, SSL enabled (`rejectUnauthorized: false`)
- Connection string from `DATABASE_URL` env var

---

## 16. Code Conventions

### Component Pattern
```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Props { /* typed props */ }

export function ComponentName({ prop1, prop2 }: Props) {
  // State declarations
  // Fetch functions with useCallback
  // useEffect for data fetching
  // 3-state rendering: loading → error/empty → content
}
```

### API Route Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // 1. Extract & validate params
    // 2. Query DB with parameterized SQL ($1, $2...)
    // 3. Return { success: true, data, hasData, meta: { company, year, period } }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to ...' }, { status: 500 });
  }
}
```

### Styling Conventions
- Page sections: `space-y-6`
- Flex/grid gaps: `gap-4`
- Cards: `<Card className="p-6">`
- Page titles: `<h1 className="text-2xl font-bold">`
- Muted text: `text-muted-foreground`
- Numbers: `text-right font-mono`, `.toFixed(2)`
- Colors: orange (#f97316) for Scope 1, blue (#3b82f6) for Scope 2
- Loading: `<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />`
- Responsive: `grid grid-cols-1 md:grid-cols-2`

### State & Data Fetching
- Company from `useSearchParams().get("company")`
- Separate `useState` + `useCallback` per data type
- Always check `response.ok` before parsing
- API responses always have `hasData` boolean
- Error state: set sensible defaults (0, [], null)

### Database Patterns
- All queries use parameterized SQL (`$1, $2, ...`) — no string interpolation
- Bulk inserts use `unnest()` for performance
- Delete-then-insert with transactions for recalculations
- JSONB for flexible schemas, NUMERIC columns for queryable aggregates

---

## 17. Key Architectural Decisions

| # | Decision | Reasoning |
|---|----------|-----------|
| 1 | Clerk for auth | Fast setup, admin-created accounts, free tier sufficient |
| 2 | PostgreSQL JSONB + GCS | Flexible schemas, queryable, original files always backed up |
| 3 | Server-side Excel parsing | More secure, easier to validate, company-specific parsers |
| 4 | Company slug as PK | Human-readable, self-documenting foreign keys |
| 5 | Consumption data keyed by work center code | Instant lookup `data.WSLT1`, matches calculation engine access pattern |
| 6 | Product intensity = sum of WC intensities | Client-specified "Approach A" — conservative estimate |
| 7 | Granular rows with JSONB sources (Shakambhari) | SQL WHERE on structured columns + JSONB flex for sources |
| 8 | No separate routing for Shakambhari | Routing embedded in production data |
| 9 | Separate API routes per company's data type | Different data shapes = different endpoints |
| 10 | Company-suffixed table names | Prevents confusion between different emission models |
| 11 | Header-based column lookup in parsers | Resilient to Excel column reordering |
| 12 | Column aliases and optional headers | Handles format variations between months |
| 13 | One emission result row per production record | Matches production data granularity, NUMERIC for fast SQL |
| 14 | Shakambhari code in subdirectory | Different model, self-contained namespace |
| 15 | Missing carbon content = warning, not error | Calculate what we can, flag what we can't |
| 16 | Carbon content hardcoded (temporary) | Awaiting client values, will migrate to DB table |
| 17 | shadcn/ui component library | Accessible, Tailwind-styled, copy-paste ownership |
| 18 | React Flow for product flows | Purpose-built for node-based UIs, dagre for layout |
| 19 | Company via URL search params | Bookmarkable, shareable, no hydration issues |
| 20 | Pre-computed node layouts (revised) | Changed to compute-on-demand — always fresh, no cache invalidation |
| 21 | Compute-on-demand for flows | <100ms dagre layout, no storage overhead |
| 22 | Unified product flows page | Same UI, different APIs per company |
| 24 | Compute-on-demand analytics | Aggregate at query time, no materialized views (OK at current scale) |

---

## 18. What Data Is Available for Report Generation

This section lists every piece of calculated/stored data that can be used to populate a report template.

### Per-Company Global Data

| Data | Source | Notes |
|------|--------|-------|
| Company name/slug | `companies` table | "Meta Engitech Pune", "Shakambhari" |
| Available periods | `available-periods` API | Which year/quarter combinations have data |

### Scope-Level Emissions

| Data | Meta Engitech Source | Shakambhari Source |
|------|---------------------|-------------------|
| Total Scope 1 emissions | `SUM(scope1_intensity)` from `emission_by_product_meta_engitech` | `SUM(net_scope1_co2e)` from `emission_results_shakambhari` |
| Total Scope 2 emissions | `SUM(scope2_intensity)` from `emission_by_product_meta_engitech` | `SUM(electricity_co2e)` from `emission_results_shakambhari` |
| Total emissions | scope1 + scope2 | scope1 + scope2 |
| YoY change | Computed via `calculateYoYChange()` | Same |

### Source-Level Breakdown

| Data | Meta Engitech | Shakambhari |
|------|--------------|-------------|
| Electricity emissions | `SUM(electricity_intensity)` | `SUM(electricity_co2e)` |
| LPG emissions | `SUM(lpg_intensity)` | N/A |
| Diesel emissions | `SUM(diesel_intensity)` | N/A |
| Material-level breakdown | N/A (only 3 sources) | Top 7 materials from `source_breakdowns` JSONB + "Others" bucket |
| Materials & Fuels total | LPG + Diesel | `SUM(net_scope1_co2e)` |

### Process-Level (Work Center) Emissions

| Data | Available Fields |
|------|-----------------|
| Work center name | `work_center` column |
| Work center description | `description` (Meta Engitech only) |
| Total emissions per WC | `total_intensity` (Meta) or `net_total_co2e` (Shakambhari) |
| Production volume | `production_mt` (Meta) or `production_qty` (Shakambhari) |
| Scope 1/2 split per WC | Available for Meta Engitech |

### Product-Level Emissions

| Data | Meta Engitech | Shakambhari |
|------|--------------|-------------|
| Product ID | `product_id` | `product_id` |
| Product name | Not stored | `product_name` |
| Emission intensity | `AVG(total_intensity)` across months | `SUM(net_total_co2e) / SUM(production_qty)` |
| Scope 1 intensity | `AVG(scope1_intensity)` | `SUM(net_scope1_co2e) / SUM(production_qty)` |
| Scope 2 intensity | `AVG(scope2_intensity)` | `SUM(electricity_co2e) / SUM(production_qty)` |
| Work center count | `work_center_count` | Derived from data |
| Total products | Count of distinct products | Count of distinct products |
| Average intensity | Computed across all products | Computed across all products |

### Time-Series Data (Monthly Granularity)

All emission tables have `year` and `month` columns, enabling:
- Month-over-month trends
- Quarterly aggregation (Q1=[1,2,3], Q2=[4,5,6], Q3=[7,8,9], Q4=[10,11,12])
- Full-year aggregation
- Year-over-year or quarter-over-quarter comparison

### Raw Detail Data (Shakambhari Only)

The `source_breakdowns` JSONB in `emission_results_shakambhari` contains per-source detail:
- Material ID, name, UOM
- Quantity consumed/produced
- Category (input/byproduct/main_product/electricity)
- Carbon content fraction
- Carbon emission (tonnes of carbon)
- CO₂e (tonnes of CO₂ equivalent)

This enables drill-down reports showing exactly which materials contribute to emissions for each product.

### Emission Constants

From `emission_constants` table:
- All emission factors used in calculations (electricity EF, fuel NCVs and EFs, carbon content map)
- Per-quarter versioning — can show which constants were used for which period

### Upload History

From `file_uploads` table:
- Complete audit trail of all data uploads
- File names, sizes, timestamps
- Which periods were uploaded/re-uploaded

---

> **Last updated:** 2026-02-26
> **Maintained by:** Cosoot development team
