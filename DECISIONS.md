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

## Learning Notes

### 2026-01-31 - Emission Intensity: Sum of Intensities vs Pooled Ratio

**Context:** Deciding how to calculate per-product emission intensity when a product passes through multiple shared work centers.

**What I learned:** There are fundamentally different ways to aggregate emission intensity across work centers, and they give very different results. Summing individual intensities (A) vs pooling consumption/production (B) can differ by 25x depending on the data. The "correct" approach depends on what question you're asking — A says "what's the total emission burden per tonne at each step," B says "what's the average emission rate across all steps." True accuracy would require knowing what fraction of each work center's output is attributable to this specific product (allocation), which we don't have.

**Why it matters:** This is the core business logic. Understanding WHY the numbers differ (and that both are approximations) is essential for defending the methodology to clients and knowing when the numbers look wrong.

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
