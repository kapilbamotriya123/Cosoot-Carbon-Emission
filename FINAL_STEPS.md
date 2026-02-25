# Cosoot — Final Implementation Steps

## Status: IN PROGRESS

---

## Context

The backend (parsing, calculation, storage) is complete for both Meta Engitech and Shakambhari. The frontend dashboard shell (sidebar, layout, company selector) is complete. Analytics page with four views (Scope/Source/Process/Product) is complete. Product Flows visualization with React Flow + dagre is complete. Auth is intentionally disabled.

This document covers the remaining changes needed to finalize the frontend before re-enabling auth.

---

## 1. Overview Page (`/dashboard`)

### Current State
- Completely empty placeholder — just says "Select a company from the top bar and navigate using the sidebar"
- No data fetching, no visualizations

### Target State (Based on Screenshot Reference)
A summary dashboard that shows the most important emission metrics at a glance for a selected company and quarter.

### Header Changes
- **Keep:** Company selector (already in top bar via layout)
- **Add:** Year + Quarter selector dropdown in the page header (e.g. "2025 - Q1")
  - Format: `{year} - {quarter}` dropdown
  - Values: dynamically generated from available years (2024, 2025, 2026) × quarters (Q1, Q2, Q3, Q4)
  - **Default:** Auto-detect the latest quarter that has data for the selected company
  - The page title "Overview" stays

### Section 1: Scope Summary Cards
Two cards side by side (NO Scope 3 — only Scope 1 and Scope 2):

| Card | Label | Data Source | Description |
|------|-------|-------------|-------------|
| Scope 1 | "Scope 1 (Direct)" | `scope1` from `/api/emissions/by-scope` | Direct emissions — fuels, materials |
| Scope 2 | "Scope 2 (Indirect)" | `scope2` from `/api/emissions/by-scope` | Indirect emissions — purchased electricity |

Each card shows:
- Icon (matching the screenshot design — flame/lightning style icons)
- Scope label
- Total emissions value in **tCO₂e**
- Optionally a "Track Emissions" link/button that navigates to Analytics → Scope view

**Total Emissions** = Scope 1 + Scope 2 (can show as a small summary line or separate card)

**API to call:** `GET /api/emissions/by-scope?company={slug}&year={year}&period={quarter}`
- This endpoint already exists and returns `{ current: { scope1, scope2 }, previous, yoyChange }`
- We only need `current.scope1` and `current.scope2` for the overview cards

### Section 2: Process-Wise / Product-Wise Emissions Table
Below the scope cards, a dropdown to switch between two views:
- **Process Wise Emissions** (default)
- **Product Wise Emissions**

#### Process Wise View
A ranked table showing all work centers sorted by total emissions (descending).

| Column | Description |
|--------|-------------|
| Ranking | 1, 2, 3... |
| Name | Work center name (+ description if available) |
| Bar indicator | Horizontal progress bar showing relative emissions (proportional to max) |
| Emissions | Numeric value in tCO₂e |
| Unit | Always "tCO₂e" |

**API to call:** `GET /api/emissions/by-process?company={slug}&year={year}&period={quarter}`
- Already exists, returns `{ data: ProcessEmission[], totalEmissions }`
- `ProcessEmission` has: `workCenter`, `description`, `emissions`, `yoyChange`

#### Product Wise View
Same table layout but showing products instead of processes.

| Column | Description |
|--------|-------------|
| Ranking | 1, 2, 3... |
| Name | Product ID / name |
| Bar indicator | Horizontal progress bar proportional to max |
| Emissions | Emission intensity in tCO₂e/t |
| Unit | "tCO₂e/t" |

**API to call:** `GET /api/emissions/by-product?company={slug}&year={year}&period={quarter}&page=1&pageSize=1000`
- Already exists, returns `{ data: ProductEmission[], avgIntensity, totalProducts }`
- `ProductEmission` has: `productId`, `productName`, `emissionIntensity`, `directEmission`, `indirectEmission`
- Fetch all products (large pageSize) since this is a summary view, not paginated

### Auto-Detect Latest Quarter
Need a lightweight API or query to determine which quarters have data for a given company.

**Option A (preferred):** New API endpoint `GET /api/emissions/available-periods?company={slug}`
- Returns: `{ periods: [{ year: "2025", quarters: ["Q1", "Q2"] }, { year: "2024", quarters: ["Q1", "Q2", "Q3", "Q4"] }] }`
- The overview page fetches this on mount, then defaults to the latest period
- This endpoint queries the emission results tables for DISTINCT year/month combinations, then maps months to quarters

**Option B:** Hardcode available years, try fetching Q4 first, fall back to Q3, etc. (brittle — avoid)

### Visual Design Notes (from screenshot)
- Scope cards: rounded border, icon on left, label + value on right, muted background
- Bar indicators in the table: two-tone (orange for the filled portion representing that row's share, gray for the remainder)
- Clean, minimal design — no charts in this section, just cards + table
- The bar width is proportional: `(row.emissions / maxEmissions) * 100%`

### Files to Create/Modify

| # | Action | File | What |
|---|--------|------|------|
| 1 | CREATE | `app/api/emissions/available-periods/route.ts` | New API: query DB for distinct year+month combos per company, return available quarters |
| 2 | MODIFY | `app/dashboard/page.tsx` | Complete rewrite — add year/quarter selector, scope cards, process/product table with dropdown switcher |
| 3 | CREATE | `components/overview/scope-cards.tsx` | Scope 1 + Scope 2 summary cards component |
| 4 | CREATE | `components/overview/emissions-table.tsx` | Ranked emissions table with bar indicators, supports both process and product data |
| 5 | CREATE | `components/overview/quarter-selector.tsx` | Year-Quarter dropdown selector with auto-detect for latest available quarter |

### Implementation Steps

1. **Build `available-periods` API** — Query both `emission_by_process_meta_engitech` and `emission_results_shakambhari` tables for DISTINCT year, month. Group months into quarters. Return sorted list (latest first).

2. **Build QuarterSelector component** — Fetches available periods on mount. Renders a Select dropdown with options like "2025 - Q1". Calls `onChange(year, quarter)` when user selects. Auto-selects the latest available period on first load.

3. **Build ScopeCards component** — Takes `scope1` and `scope2` numbers as props. Renders two cards side by side. Each card: icon, label, value formatted as `X.XX tCO₂e`. No Scope 3.

4. **Build EmissionsTable component** — Takes array of `{ rank, name, emissions, unit }`. Renders ranked table with horizontal bar indicators. Bar width = `(emissions / maxEmissions) * 100%`. Two-tone bar (orange fill + gray remainder).

5. **Rewrite dashboard/page.tsx** — Compose the above components. Manage state for: selected quarter, active view (process/product), data from API calls. Fetch scope data + process/product data when quarter changes.

---

## 2. Analytics Page (`/dashboard/analytics`)

### Current State
- Fully functional with four views: Scope, Source, Process, Product
- Year selector (2024/2025/2026) and Period selector (Full Year, Q1-Q4)
- Each view fetches from its own API endpoint
- Has charts (Recharts bar charts) + data tables with YoY/QoQ comparison

### Changes Needed
*(To be filled in by user — awaiting details)*

---

## 3. Product Flows Page (`/dashboard/product-flows`)

### Current State
- Product list page showing all products for selected company
- Detail page (`/product-flows/[productId]`) with React Flow diagram
- Month selector on detail page
- "Show Details" toggle for emission data on nodes
- Works for both Meta Engitech and Shakambhari

### Changes Needed
*(To be filled in by user — awaiting details)*

---

## 4. Upload Pages (Routing / Consumption / Production)

### Current State
- All three upload pages exist and work
- Admin-only section in sidebar

### Changes Needed
*(To be filled in by user — awaiting details)*

---

## 5. Auth / RBAC (Last)

### Current State
- Clerk auth is completely disabled (commented out)
- Sidebar has admin section but no enforcement
- Company selector shows all companies to everyone

### Changes Needed
- Re-enable Clerk auth
- Map users to companies
- Admin sees all companies + upload pages
- Company users locked to their company
- This is explicitly the LAST thing to implement

---

## Dependencies to Install

For Overview page: None new — already have shadcn components (Card, Select, Table) and Recharts.

---

## Implementation Order

1. **Overview page** (Section 1 above) — this is the current priority
2. Analytics page changes (Section 2 — awaiting details)
3. Product Flows changes (Section 3 — awaiting details)
4. Upload page changes (Section 4 — awaiting details)
5. Auth/RBAC (Section 5 — last)
