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

## Learning Notes

### 2026-01-30 - Emission Intensity Calculation

**Context:** Designing the emission calculation engine.

**What I learned:** Emission intensity per product isn't simply "emissions of work centers used by that product." Since one work center serves multiple products, you have to: (1) find all work centers for the product, (2) sum their total emissions, (3) divide by total production across all those work centers. This gives a weighted average rather than attributing all of a work center's emissions to one product.

**Why it matters:** This aggregation logic is the core business logic. Getting it wrong means incorrect emission reports for clients.

---

## Mistakes & Corrections

*None yet — project just started.*

---

## Post-Project Reflection

*Fill this out when the project is complete*

**What I'd do differently:**

**What worked well:**

**Skills I developed:**

**Questions I still have:**
