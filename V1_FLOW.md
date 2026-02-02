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

### Phase 8: Shakambhari — Emission Calculation (Pending)
- Emission factors not yet available from client
- Net emission per source = (consumed_qty - byproduct_qty) × emission_factor
- Emission factor mapping: component material → factor (to be stored separately)
- Scopes: classification depends on source type (not fixed like Meta Engitech)
- Formulas may change monthly — factors stored separately from code
- Results will go in Shakambhari-specific emission tables (schema TBD)

---

## Data Flow

```
Excel Upload (BOM/routing)          Excel Upload (monthly consumption)
        │                                       │
        ▼                                       ▼
  Server-side parse                      Server-side parse
  (xlsx library)                         (xlsx library)
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
                                      (3 formulas applied)
                                                │
                                                ▼
                                      Store results as JSONB
                                      in PostgreSQL
                                                │
                                                ▼
                                          Dashboard
```

---

## Key Notes

- **Parsing is company-specific.** Each company's Excel format differs. We'll build parsers per company. No universal schema.
- **JSONB everywhere.** No rigid table schemas for company data. PostgreSQL JSONB gives us flexibility while still being queryable.
- **Original Excels are always kept** in GCP Cloud Storage as source of truth / backup.
- **Node-flow UI** shows product → work center sequence only (no consumption/emission data on nodes). To be built later.
