# Project Decision Log: Cosoot — Carbon Emission Calculator

> This document tracks architectural decisions, technical choices, and learnings throughout the project. It serves two purposes: (1) forcing deliberate decision-making rather than default choices, and (2) building a personal knowledge base over time.

---

## Project Overview

**One-paragraph problem statement:**
Cosoot is a B2B platform that calculates carbon emissions for industrial companies. Admin onboards clients (creates accounts, no public signup). Each client uploads their product routing (BOM file — which work centers a product passes through) and monthly energy consumption data (electricity, LPG, diesel per work center). The system calculates emissions per work center and emission intensity per product using standard conversion formulas. Results are displayed on a dashboard with product-level breakdowns.

**The hard parts of this project:**
1. Company-specific Excel parsing — each client's data format is different, so we can't build one universal parser
2. Mapping consumption to products — a work center serves multiple products, so emission intensity requires aggregation logic (sum work center emissions / total production across those work centers)
3. Keeping the architecture clean and flexible despite schemaless, company-varying data

**Initial architecture sketch:**
Next.js (App Router) + Clerk (auth) + GCP Cloud SQL PostgreSQL (JSONB storage) + GCP Cloud Storage (Excel backups). Server-side Excel parsing. Calculation engine in API routes. Dashboard with per-product and per-work-center views.

---

## Decisions Log

### Decision 1: Authentication — Clerk

**Date:** 2026-01-30

**Choice:** Clerk (managed auth service)

**Alternatives considered:**
- NextAuth.js (Auth.js v5): Full control, self-managed, free but requires building email/password reset flows manually
- Supabase Auth: Includes auth + DB, but ties us to Supabase ecosystem

**Reasoning:** We need admin-created accounts (no public signup), password reset via email, and a fast setup. Clerk's free tier (10k MAU) is far beyond our needs. Built-in admin dashboard means we don't need to build account management UI. Priority is shipping auth quickly so we can focus on the core emission logic.

**Tradeoffs accepted:** Vendor lock-in with Clerk. If we outgrow the free tier or need custom auth flows, migration will require effort. Acceptable given the small user base and speed priority.

**Status:** Active

---

### Decision 2: Data Storage — PostgreSQL JSONB + GCP Cloud Storage

**Date:** 2026-01-30

**Choice:** Store parsed Excel data as JSONB in GCP Cloud SQL (PostgreSQL). Keep original Excel files in GCP Cloud Storage as backup.

**Alternatives considered:**
- Files only (parse on demand): Simplest but slow for repeated queries, no queryability
- MongoDB Atlas: Natively schemaless, but adds another service; PostgreSQL JSONB gives us the same flexibility
- Skip DB entirely: Too limiting once we need dashboards and historical data

**Reasoning:** Each company's data structure differs — rigid schemas would be a maintenance nightmare. JSONB gives us schemaless flexibility inside PostgreSQL, which is still queryable and performant. Keeping original Excels in GCP Cloud Storage means we always have the raw source if we need to re-parse. GCP chosen because Kapil has significant credits there.

**Tradeoffs accepted:** JSONB queries are less performant than structured columns for complex aggregations. Acceptable at our scale. If we hit performance issues later, we can add materialized views or structured tables for hot paths.

**Status:** Active

---

### Decision 3: Excel Parsing — Server-side

**Date:** 2026-01-30

**Choice:** Parse Excel files server-side using `xlsx` or `exceljs` library in Next.js API routes.

**Alternatives considered:**
- Client-side parsing: Parse in browser, send JSON to backend. Reduces server load but less secure, harder to validate.
- Hybrid: Client previews, server does final parse. More complexity than needed right now.

**Reasoning:** Server-side is simpler, more secure (we control the parsing), and lets us validate data before storing. Since parsers are company-specific anyway, keeping all parsing logic on the server makes it easier to manage and update.

**Tradeoffs accepted:** Larger file uploads hit the server directly. Fine at our scale (~30 users, monthly uploads).

**Status:** Active

---

### Decision 4: Company Slug as Primary Key

**Date:** 2026-01-30

**Choice:** Use the company slug (e.g. `meta_engitech_pune`) as the primary key in the `companies` table instead of an auto-increment integer ID.

**Reasoning:** The slug is inherently unique (it maps 1:1 to a company), is human-readable in queries and logs, and eliminates the need for a join or lookup when referencing companies from other tables. Foreign keys like `company_slug TEXT REFERENCES companies(slug)` are self-documenting.

**Tradeoffs accepted:** Slightly larger foreign key columns (TEXT vs INTEGER). Negligible at our scale.

**Status:** Active

---

### Decision 5: Consumption Data — Work-Center-Keyed JSONB

**Date:** 2026-01-31

**Choice:** Store monthly consumption data as a JSONB object keyed by work center code (e.g. `{"WSLT1": {...}, "WSLT2": {...}}`), not as an array.

**Alternatives considered:**
- Array of work center objects: Simpler to iterate, but requires filtering/finding to access a specific work center
- One DB row per work center per month: More relational, but adds complexity and many rows

**Reasoning:** Keyed by work center code means `data.WSLT1` gives instant access to a specific work center's data — no searching through arrays. This matches how the data will be consumed in the calculation engine (look up work centers by code from the routing data). The `consumption_data` table uses a `UNIQUE(company_slug, year, month)` constraint so each month has exactly one record per company.

**Tradeoffs accepted:** Can't easily query across work centers using SQL (e.g. "find all work centers with production > 1000") without JSONB path operators. Acceptable because we'll do that kind of logic in application code anyway.

**Status:** Active

---

### Decision 6: Product Emission Intensity — Sum of Work Center Intensities

**Date:** 2026-01-31

**Choice:** Calculate product emission intensity by summing the emission intensities of each work center the product passes through (Approach A).

**Formula:** `product_intensity = Σ intensity(WC_i)` where `intensity(WC) = (consumption / production) × constants`

**Alternatives considered:**
- **Approach A (chosen — sum of intensities):** Sum each work center's intensity independently. `(kwh1/prod1 × k) + (kwh2/prod2 × k) + ...`
- **Approach B (pooled ratio):** Pool all consumption and production, then divide. `(kwh1+kwh2+...) / (prod1+prod2+...) × k`

**Example showing the difference (WSLT1: 2721kWh/1250MT, WTM1: 7299kWh/36.7MT):**
- Approach A: 0.120231 tCO₂/tonne (dominated by the high-intensity low-volume step)
- Approach B: 0.004652 tCO₂/tonne (averaged out by pooling)

**Reasoning:** Client explicitly specified Approach A. It's the more conservative estimate — reflects that the product physically passed through each work center and "consumed" that step's energy intensity. Neither approach is truly accurate without proper allocation (knowing what fraction of each work center's output belongs to this product), but Approach A is what was asked for.

**Tradeoffs accepted:** Overstates intensity for products passing through low-volume, high-energy work centers. Can be refined later if the client provides allocation data.

**Status:** Active

---

### Decision 7: Granular Rows with JSONB Sources for Shakambhari

**Date:** 2026-01-31

**Choice:** One row per (company_slug, date, work_center, product_id, order_no), with consumption sources as a JSONB array.

**Alternatives considered:**
- One blob per date: Simpler insert, but no SQL WHERE on product/work center columns
- One row per source: Fully relational, but creates far more rows and complicates grouping

**Reasoning:** Granular rows allow SQL WHERE on structured columns (date, work_center, product_id) while JSONB sources keep the variable number of components flexible. Natural append/upsert via the UNIQUE constraint.

**Status:** Active

---

### Decision 8: No Separate Routing Upload for Shakambhari

**Date:** 2026-01-31

**Choice:** Shakambhari does not have a separate routing/BOM upload step. Product → work center mapping is embedded in the production data file.

**Reasoning:** Unlike Meta Engitech where routing is semi-permanent and consumption is monthly, Shakambhari's single Excel file contains both production quantities and consumption sources per product per day.

**Status:** Active

---

### Decision 9: Separate /api/production/upload Route

**Date:** 2026-01-31

**Choice:** Created a new `/api/production/upload` endpoint rather than extending `/api/consumption/upload`.

**Reasoning:** Shakambhari's data shape is fundamentally different — daily vs monthly, embedded routing, different emission sources, no year/month URL params (dates extracted from data). Sharing an endpoint would require excessive conditional logic.

**Status:** Active

---

### Decision 10: Renamed Meta Engitech Emission Tables

**Date:** 2026-01-31

**Choice:** Renamed `emission_by_process` → `emission_by_process_meta_engitech` and `emission_by_product` → `emission_by_product_meta_engitech`.

**Reasoning:** The generic table names had Meta Engitech-specific columns (electricity/LPG/diesel intensity). Clear naming prevents confusion when adding Shakambhari emission tables later, which will have different column structures.

**Status:** Active

---

### Decision 11: Header-Based Column Lookup in All Parsers

**Date:** 2026-01-31

**Choice:** All Excel parsers now resolve columns by header name instead of hardcoded column indices. Shared utility in `lib/parsers/utils.ts`.

**Alternatives considered:**
- Keep hardcoded indices: Simpler but breaks if client reorders columns
- Per-parser header logic: Duplicates the matching code

**Reasoning:** Header-based lookup is resilient to column reordering. The shared `buildColumnMap` + `resolveColumns` utilities handle case-insensitive matching and whitespace normalization, reducing per-parser boilerplate.

**Status:** Active

---

### Decision 12: Aliases and Optional Headers in resolveColumns

**Date:** 2026-02-02

**Choice:** Extended `resolveColumns` to support `aliases` (alternative header names) and `optional` fields (columns that may not exist). Applied to the Meta Engitech consumption parser: `"Energy in KWh"` is accepted as an alias for `"Total Energy in KWh"`, `"Date"` for `"DateVAlue"`, and `energyMSEB`/`energySolar` are optional (null when absent).

**Problem:** Meta Engitech's consumption CSVs have two column layouts across months — April has a single `Energy in KWh` column and `Date`, while May has `Total Energy in KWh` split into `Energy MSEB KWh` + `Energy Solar KWh`, and `DateVAlue`. The parser was throwing on April files because it required all headers.

**Alternatives considered:**
- Two separate parsers (one per format): Works but duplicates most logic for a small difference
- Require the newer format: Shifts burden to the client to re-export old data

**Reasoning:** Same parser handles both layouts gracefully. The total energy value is the same regardless of whether MSEB/Solar are split out — we just store nulls when the breakdown isn't available. `resolveColumns` stays backward-compatible (the new `opts` parameter is optional).

**Status:** Active

---

### Decision 13: Shakambhari Emission Results — One Row per Production Record with JSONB Source Breakdowns

**Date:** 2026-02-02

**Choice:** `emission_results_shakambhari` stores one row per `(company_slug, date, work_center, product_id, order_no)`. Aggregate values (net_co2e, scope1, scope2, electricity) as NUMERIC columns. Per-source calculation detail in a `source_breakdowns` JSONB column.

**Alternatives considered:**
- Separate rows per source: 5-15x more rows (75k-225k/month), and dashboard queries always need GROUP BY for aggregates
- Pure JSONB blob for everything: Can't ORDER BY or SUM aggregates with standard SQL

**Reasoning:** Matches production_data_shakambhari granularity. Real NUMERIC columns enable fast SQL queries for dashboards (SUM, GROUP BY month, ORDER BY net_total_co2e). JSONB source detail allows drill-down without a separate table.

**Status:** Active

---

### Decision 14: Shakambhari Emission Engine — Subdirectory Namespace

**Date:** 2026-02-02

**Choice:** All Shakambhari emission files live under `lib/emissions/shakambhari/` (constants, types, calculate, engine) rather than being suffixed files in `lib/emissions/`.

**Reasoning:** Shakambhari's model (carbon content per material, input-output mass balance) is fundamentally different from Meta Engitech's (fuel consumption per work center, fixed 3 sources). Sharing a directory with different-named exports would create confusing imports. Subdirectory keeps each company's emission logic self-contained.

**Status:** Active

---

### Decision 15: Missing Carbon Content — Warnings, Not Errors

**Date:** 2026-02-02

**Choice:** When a material's carbon content is not found in the constants map, the calculation continues with 0 emission for that material and adds a warning to the response. The API returns both `resultCount` and `warnings[]`.

**Alternatives considered:**
- Throw error: Blocks all calculation for one missing material
- Silently skip: Produces incorrect totals without any indication

**Reasoning:** During ramp-up, not all materials will have carbon content values. Calculate what we can, surface what we can't. The warnings make it clear which results are incomplete.

**Status:** Active

---

### Decision 16: Carbon Content Hardcoded in Constants File (Temporary)

**Date:** 2026-02-02

**Choice:** Carbon content values stored in `lib/emissions/shakambhari/constants.ts` as a `Record<compMat, { compName, carbonContent }>`. Placeholder values in realistic ranges for now.

**Future path:** Create a `carbon_content` DB table with `(compMat, compName, carbonContent, validFrom, validTo)` so the client can update values per date range via UI. Only `engine.ts` changes — it fetches from DB instead of importing constants, passes the map to `calculate.ts`.

**Reasoning:** Client hasn't provided final values yet. File-based constants let us build and test the full pipeline now. The calculate functions are pure (receive data, return results) so swapping the data source later is a one-file change.

**Status:** Active (temporary — will migrate to DB)

---

### Decision 17: UI Framework — shadcn/ui

**Date:** 2026-02-02

**Choice:** shadcn/ui (new-york style, neutral base color, lucide icons) for all frontend components.

**Alternatives considered:**
- Radix UI directly: Lower level, more work to style consistently
- Material UI: Heavy, opinionated design system, harder to customize
- Headless UI + custom Tailwind: More work to build accessible components from scratch
- Ant Design: Enterprise-focused but heavy, React 19 compatibility concerns

**Reasoning:** shadcn/ui gives us copy-paste components that are built on Radix primitives (accessible by default), styled with Tailwind (matches our existing setup), and fully customizable since the source lives in our repo. The sidebar component specifically handles responsive behavior (collapsible on desktop, sheet on mobile) out of the box — exactly what we need for the dashboard layout. Lightweight because we only install the components we use.

**Status:** Active

---

### Decision 18: React Flow for Product Flow Visualization

**Date:** 2026-02-02

**Choice:** React Flow (`@xyflow/react`) for the node-based product flow diagram.

**Alternatives considered:**
- D3.js: Lower level, maximum control, but significantly more work for node-based UIs. Better for custom chart types, overkill for node graphs.
- vis.js: Good for network graphs but less React-native, older API.
- Custom SVG: Maximum control but enormous effort for pan/zoom/layout.

**Reasoning:** React Flow is purpose-built for node-based UIs in React. Built-in pan/zoom, minimap, custom nodes, and excellent React integration. Used by Stripe and other production apps. MIT license. Will pair with dagre/elkjs for auto-layout of directed graphs.

**Status:** Active (to be installed in Phase 3)

---

### Decision 19: Company Context via URL Search Params

**Date:** 2026-02-02

**Choice:** Selected company stored in URL search params (`?company=meta_engitech_pune`), not React context, localStorage, or cookies.

**Alternatives considered:**
- React Context: Loses state on refresh, requires hydration handling in Next.js
- localStorage: Same hydration issues, not shareable/bookmarkable
- Server-side session/cookie: More infrastructure, requires auth

**Reasoning:** URL params are the simplest approach that's bookmarkable, shareable, and has zero hydration issues with Next.js server components. When a user selects a company, the URL updates. All data-fetching pages read from URL params. Works with both server and client components.

**Status:** Active

---

### Decision 20: Pre-computed Node Layouts Stored in DB

**Date:** 2026-02-02

**Choice:** Product flow node positions and edges will be pre-computed and stored in a `product_flow_nodes` DB table, not generated on every page load.

**Alternatives considered:**
- Compute on page load: Simple but slow for products with many work centers, and layout would shift on every load
- Static JSON files: No dynamic updates when new products appear

**Reasoning:** Node layout computation (via dagre) is deterministic but non-trivial. Pre-computing once on upload and storing the result means instant page loads. For Shakambhari where 95% of products are the same month-to-month, we detect new products on upload and only generate layouts for those. Stored as JSONB (nodes array + edges array) per product per company.

**Status:** Revised (see Decision 21)

---

### Decision 21: Product Flow Visualization — Compute-on-Demand with dagre Layout

**Date:** 2026-02-03

**Choice:** Product flow nodes and edges are computed on-demand in the API route using dagre for layout, not pre-computed and stored.

**Alternatives considered:**
- Pre-computed in DB (original plan from Decision 20): Faster page loads, but requires storage and invalidation logic
- Client-side dagre: Simpler backend, but slower initial render and requires shipping layout lib to browser

**Reasoning:** On-demand computation with server-side dagre provides the best balance:
1. **No storage overhead** — Flow graphs are derived from routing/production data, no separate table needed
2. **Always fresh** — Changes to routing or production data automatically reflect in flows
3. **Fast enough** — dagre layout is deterministic and completes in <100ms for typical product graphs
4. **Simpler architecture** — No cache invalidation, no separate migration for flow data

For Meta Engitech, flows are derived from `routing_data` + `consumption_data` (fuel nodes based on monthly usage). For Shakambhari, flows are built from the first occurrence of a product in a selected month from `production_data_shakambhari`.

**Implementation details:**
- **Meta Engitech flow structure:** Input materials → Work centers (with routing sequence) → Final product. Fuel nodes (electricity/LPG/diesel) branch from work centers that consume them in the selected month.
- **Shakambhari flow structure:** Input materials (including Mix Power as a fuel node) → Single work center → Main product + Byproducts. Simpler flow reflects their single-step process.
- **Shared components:** Both companies use the same React Flow diagram component with custom node types (MaterialNode, WorkCenterNode, FuelNode). Dagre layout configured as top-to-bottom (TB) for Meta Engitech and left-to-right (LR) for Shakambhari.
- **Month selection:** Both flows support month/year filtering via dropdown. Meta Engitech filters fuel nodes by monthly consumption. Shakambhari shows the first production occurrence in the selected month.

**Tradeoffs accepted:** Repeated page loads recompute the same graph. Acceptable given the compute is fast and user pattern is "load once, explore." Can add caching later if needed.

**Status:** Active (completed 2026-02-03)

---

### Decision 22: Unified Product Flows Page for Both Companies

**Date:** 2026-02-03

**Choice:** Single `/dashboard/product-flows` page that routes to different APIs based on selected company (`?company=meta_engitech_pune` vs `?company=shakambhari`).

**Alternatives considered:**
- Separate pages (`/dashboard/product-flows` for Meta, `/dashboard/product-flows-shakambhari` for Shakambhari): Clear separation, but duplicates UI code
- Single API with company detection: Backend complexity to merge two different data sources

**Reasoning:** The product list UI is fundamentally the same (table with search, pagination, "View Flow" button). The only differences are:
- **Meta Engitech** shows "Work Centers" column (count of work centers in routing)
- **Shakambhari** shows "Product Name" column (from production records)
- Different API endpoints (`/api/product-flows` vs `/api/product-flows-shakambhari`)

Making the page company-aware with conditional rendering keeps the codebase DRY while handling both companies gracefully. Union types handle response format differences.

**Implementation:**
- Frontend detects `isShakambhari = company === "shakambhari"`
- Routes to correct API endpoint based on company
- Table headers and cells adapt based on company
- Product detail page similarly adapts (shows Shakambhari-specific info like production date, work center, quantity when applicable)

**Status:** Active (completed 2026-02-03)

---

### Decision 23: PostgreSQL JSONB Auto-Parsing Behavior

**Date:** 2026-02-03

**Issue discovered:** In Shakambhari production API route, `JSON.parse(rawRecord.sources)` threw "Unexpected token 'o', '[object Obj...' is not valid JSON".

**Root cause:** PostgreSQL JSONB columns are automatically parsed by the `node-postgres` (pg) driver into JavaScript objects. Attempting to parse an already-parsed object causes the error.

**Learning:** Unlike JSON stored as TEXT (which requires `JSON.parse()`), JSONB is a native PostgreSQL type that the pg driver deserializes automatically. This is a feature — you get JavaScript objects directly from queries without manual parsing.

**Fix:** Removed `JSON.parse()` call, used `rawRecord.sources` directly.

**Why it matters:** This is a subtle difference between storing JSON as TEXT vs JSONB. JSONB has better query performance (can index into fields, use operators like `@>`) AND automatic parsing. TEXT JSON requires manual `JSON.parse()` in application code.

**Status:** Documented

---

## Learning Notes

### 2026-02-03 - React Flow + dagre for Manufacturing Flow Diagrams

**Context:** Building the product flow visualization feature to show input materials → work centers → products with fuel consumption nodes.

**What I learned:** React Flow is purpose-built for node-based UIs but doesn't do auto-layout — you need to provide node positions. That's where dagre comes in:

1. **React Flow** provides the rendering layer: pan/zoom, minimap, custom node components, edge routing
2. **dagre** provides the graph layout algorithm: given nodes + edges, computes (x, y) positions for each node

The integration pattern:
```typescript
// 1. Create nodes + edges with position placeholders
const nodes = [...]; // position: { x: 0, y: 0 }
const edges = [...];

// 2. Build dagre graph
const g = new dagre.graphlib.Graph();
g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
nodes.forEach(n => g.setNode(n.id, { width: 200, height: 60 }));
edges.forEach(e => g.setEdge(e.source, e.target));

// 3. Run layout algorithm
dagre.layout(g);

// 4. Apply computed positions back to nodes
const positioned = nodes.map(n => ({
  ...n,
  position: { x: g.node(n.id).x - 100, y: g.node(n.id).y - 30 }
}));
```

Key dagre settings:
- `rankdir`: 'TB' (top-to-bottom) or 'LR' (left-to-right)
- `nodesep`: horizontal spacing between nodes in same rank
- `ranksep`: vertical spacing between ranks (layers)

**Custom node types:** React Flow lets you define custom node components. We created three: MaterialNode (grey, gear icon), WorkCenterNode (orange, shows operation name), FuelNode (blue/yellow, shows fuel type icon). Each renders different content but shares the same data structure.

**React Flow constraints:**
- `nodesDraggable={false}` — prevent manual repositioning
- `translateExtent` — constrain panning to graph bounds (calculated from node positions + padding)
- `fitView` — auto-zoom to show entire graph on load
- `MiniMap` — thumbnail overview with color-coded nodes by type

**Why it matters:** This pattern (React Flow + dagre) is reusable for any directed graph visualization. Understanding the separation of concerns (React Flow = rendering, dagre = layout) is key. You could swap dagre for elk.js (better for complex graphs) or D3 force simulation (for organic layouts) without changing the React Flow layer.

---

### 2026-01-31 - Emission Intensity: Sum of Intensities vs Pooled Ratio

### 2026-01-31 - Emission Intensity: Sum of Intensities vs Pooled Ratio

**Context:** Deciding how to calculate per-product emission intensity when a product passes through multiple shared work centers.

**What I learned:** There are fundamentally different ways to aggregate emission intensity across work centers, and they give very different results. Summing individual intensities (A) vs pooling consumption/production (B) can differ by 25x depending on the data. The "correct" approach depends on what question you're asking — A says "what's the total emission burden per tonne at each step," B says "what's the average emission rate across all steps." True accuracy would require knowing what fraction of each work center's output is attributable to this specific product (allocation), which we don't have.

**Why it matters:** This is the core business logic. Understanding WHY the numbers differ (and that both are approximations) is essential for defending the methodology to clients and knowing when the numbers look wrong.

---

### 2026-02-02 - Carbon Mass Balance vs Fuel Consumption Models

**Context:** Building the Shakambhari emission calculation engine. Had to understand why Shakambhari's approach is fundamentally different from Meta Engitech's.

**What I learned:** There are two common approaches to carbon emission accounting in manufacturing:

1. **Fuel consumption model** (Meta Engitech): You know the energy sources (electricity, LPG, diesel) consumed per work center. You multiply consumption by standard emission factors (IPCC/CEA constants). Simple and well-documented, but only covers energy-related emissions.

2. **Carbon mass balance model** (Shakambhari): You track carbon entering the process (in raw materials) and carbon leaving (in products and byproducts). The difference = carbon emitted to atmosphere. Formula: `Net emission = Σ(input carbon) − Σ(output carbon)`. Convert carbon to CO₂ via the molecular weight ratio: `CO₂ = C × 44/12`.

The mass balance approach is more comprehensive for process emissions (e.g., carbon in coke that gets burned off during smelting isn't captured by tracking just electricity/LPG/diesel). But it requires knowing the carbon content of every material, which varies by supplier and batch — hence why those values need to be client-configurable.

**Why it matters:** These two models aren't interchangeable. Using the wrong model would give meaningless numbers. Understanding which model fits which industry is key to building correct calculation engines for new clients.

---

### 2026-01-30 - CREATE TABLE IF NOT EXISTS Doesn't Alter Existing Tables

**Context:** Changed the schema from `company_id INTEGER` to `company_slug TEXT` but the old tables still existed in the database.

**What I learned:** `CREATE TABLE IF NOT EXISTS` only creates the table if it doesn't exist — it does NOT alter an existing table to match your new column definitions. If the table already exists with the old schema, the statement silently succeeds and the old schema stays. Had to DROP the old tables to apply the new schema.

**Why it matters:** This is a common gotcha. In production, you'd use proper migrations (ALTER TABLE or a migration tool like Prisma Migrate / Flyway) instead of DROP + recreate.

---

## Mistakes & Corrections

### 2026-01-30 - DROP TABLE in initializeSchema() called on every request

**What happened:** Added `DROP TABLE` to `initializeSchema()` as a one-time migration fix, but `initializeSchema()` was called on every upload request. This meant every upload would wipe all existing data.

**Root cause:** Mixing migration logic (one-time schema changes) with initialization logic (safe to run repeatedly).

**Fix:** Removed the DROP statement after confirming the migration worked. `initializeSchema()` now only uses `CREATE TABLE IF NOT EXISTS`, which is safe to call on every request.

**Lesson:** Keep migrations separate from schema initialization. Migrations are one-time operations; initialization should be idempotent (safe to run repeatedly with the same result).

---

## Post-Project Reflection

*Fill this out when the project is complete*

**What I'd do differently:**

**What worked well:**

**Skills I developed:**

**Questions I still have:**
