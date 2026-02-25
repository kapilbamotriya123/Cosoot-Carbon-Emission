# Cosoot Next Project — Step Implementation Prompt

> **How to use:** Copy everything below the `---` line. Paste it as the first message in a new Claude Code session. Then fill in the `[YOUR REQUIREMENTS HERE]` section at the bottom with the specific changes you want for that step.

---

## Project Context

This is **Cosoot** — a carbon emissions tracking dashboard built with:
- **Next.js 16** (App Router), **React 19**, **TypeScript 5**
- **shadcn/ui** (Radix UI primitives) for all UI components
- **Tailwind CSS 4** for styling
- **Recharts 3** for charts
- **React Flow** (`@xyflow/react`) for product flow diagrams
- **PostgreSQL** (`pg` driver, `DATABASE_URL` env var, SSL enabled)
- **Lucide React** for icons
- **Clerk** for auth (currently **disabled**)

Working directory: `/Users/kapilbamotriya/Desktop/Web/cosoot_next_project`

---

## What's Already Built (DO NOT rebuild — use/extend these)

### Layout & Navigation
- **Dashboard layout** (`app/dashboard/layout.tsx`): SidebarProvider → AppSidebar + SidebarInset with header (SidebarTrigger, Separator, CompanySelector) + content area (`flex-1 p-6`)
- **Sidebar** (`components/app-sidebar.tsx`): Main nav (Overview, Analytics, Product Flows) + Admin nav (Upload Routing, Upload Consumption, Upload Production)
- **Company Selector** (`components/company-selector.tsx`): Reads/writes `?company=` URL param. Two companies: `meta_engitech_pune` and `shakambhari`
- **Constants** (`lib/constants.ts`): `COMPANIES` array with `{ slug, label }`, `CompanySlug` type

### Pages
1. **Overview** (`app/dashboard/page.tsx`) — Quarter selector, Scope 1+2 cards, process/product emissions ranked table
2. **Analytics** (`app/dashboard/analytics/page.tsx`) — 4 views (Scope, Source, Process, Product) with year/period selectors, Recharts bar charts, data tables with YoY comparison
3. **Product Flows** (`app/dashboard/product-flows/page.tsx`) — Product list with search + pagination
4. **Product Flow Detail** (`app/dashboard/product-flows/[productId]/page.tsx`) — React Flow diagram with month selector, "Show Details" toggle
5. **Upload Routing** (`app/dashboard/upload-routing/page.tsx`) — File upload for routing data
6. **Upload Consumption** (`app/dashboard/upload-consumption/page.tsx`) — File upload + year/month selectors
7. **Upload Production** (`app/dashboard/upload-production/page.tsx`) — File upload for Shakambhari production data

### Reusable Components
- `components/overview/quarter-selector.tsx` — Fetches available periods, auto-selects latest, returns `(year, quarter)`
- `components/overview/scope-cards.tsx` — Two cards (Scope 1 orange/flame, Scope 2 blue/lightning) with loading state
- `components/overview/emissions-ranked-table.tsx` — Ranked table with orange bar indicators, `RankedEmission` interface: `{ name, emissions, unit }`
- `components/analytics/EmissionsByScope.tsx` — Scope breakdown with chart + table
- `components/analytics/EmissionsBySource.tsx` — Source breakdown with chart + table
- `components/analytics/EmissionsByProcess.tsx` — Process/work-center breakdown with chart + table
- `components/analytics/EmissionsByProduct.tsx` — Product emissions with pagination (10/20/30 page sizes)
- `components/product-flow/flow-diagram.tsx` — React Flow wrapper with Background, Controls, MiniMap
- `components/product-flow/nodes/` — work-center-node.tsx, material-node.tsx, fuel-node.tsx

### API Routes (all under `app/api/`)
| Endpoint | Method | Returns |
|----------|--------|---------|
| `/emissions/by-scope` | GET | `{ data: { current: { scope1, scope2 }, previous, yoyChange }, hasData }` |
| `/emissions/by-source` | GET | `{ data: SourceEmission[], hasData }` |
| `/emissions/by-process` | GET | `{ data: ProcessEmission[], totalEmissions, hasData }` |
| `/emissions/by-product` | GET | `{ data: ProductEmission[], avgIntensity, totalProducts, hasData }` (paginated) |
| `/emissions/summary` | GET | `{ data: { totalEmissions, scope1, scope2, ... }, hasData }` |
| `/emissions/available-periods` | GET | `{ periods: [{ year, quarters: string[] }] }` |
| `/emissions/calculate` | POST | Triggers calculation for Meta Engitech |
| `/emissions/shakambhari/calculate` | POST | Triggers calculation for Shakambhari |
| `/product-flows` | GET | `{ products: Product[] }` (paginated, for Meta Engitech) |
| `/product-flows/[productId]` | GET | `{ product, nodes, edges, months }` |
| `/product-flows-shakambhari` | GET | Same structure, Shakambhari-specific |
| `/product-flows-shakambhari/[productId]` | GET | Same structure, Shakambhari-specific |
| `/routing/upload` | POST | Parse + store routing Excel |
| `/consumption/upload` | POST | Parse + store consumption Excel |
| `/production/upload` | POST | Parse + store production Excel |
| `/setup` | GET | Initialize database tables |

**Query params used across APIs:** `company` (slug), `year`, `period` (Q1/Q2/Q3/Q4/FULL_YEAR), `page`, `pageSize`

### Database Tables (PostgreSQL)
- `emission_by_product_meta_engitech` — columns include: company_slug, year, month, product_id, scope1_intensity, scope2_intensity, total_intensity, etc.
- `emission_by_process_meta_engitech` — work_center, description, year, month, emission values
- `emission_results_shakambhari` — product_id, product_name, year, month, net_scope1_co2e, electricity_co2e, net_total_co2e, etc.
- `routing_data` — JSONB with product → work center mappings
- `consumption_data` — Monthly consumption records
- `production_data_shakambhari` — Shakambhari production records
- `product_flow_nodes` — Pre-computed React Flow node/edge layouts

### Utility Libraries (in `lib/`)
- `lib/analytics/utils.ts` — `validateCompany()`, `parseTimeRange()`, `calculateYoYChange()`, `TimePeriod` type
- `lib/analytics/by-scope.ts` — `getScopeEmissionsWithYoY()`, company-specific SQL query functions
- `lib/analytics/by-source.ts` — Source emission calculation functions
- `lib/analytics/by-process.ts` — Process emission calculation functions
- `lib/analytics/by-product.ts` — Product emission calculation functions
- `lib/constants.ts` — `COMPANIES`, `CompanySlug`

---

## Code Conventions (FOLLOW THESE EXACTLY)

### Component Pattern
```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
// shadcn imports with @/components/ui/
// lucide icon imports
// local component imports

interface Props { /* typed props */ }

export function ComponentName({ prop1, prop2 }: Props) {
  // State
  // Fetch functions with useCallback
  // useEffect for data fetching
  // 3-state rendering: loading → error/empty → content
}
```

### API Route Pattern
```ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany, parseTimeRange } from '@/lib/analytics/utils';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

### Styling
- Layout: `space-y-6` (page sections), `gap-4` (flex/grid items)
- Cards: `<Card className="p-6">` wrapping content sections
- Headers: `<h1 className="text-2xl font-bold">` for page titles
- Muted text: `text-muted-foreground`
- Numbers: `text-right font-mono`, `.toFixed(2)`
- Colors: orange (#f97316) for Scope 1, blue (#3b82f6) for Scope 2, green for positive change, red for negative
- Loading: `<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />`
- Responsive: `grid grid-cols-1 md:grid-cols-2` patterns

### State & Data Fetching
- Company from `useSearchParams().get("company")`
- Separate `useState` + `useCallback` per data type (not one giant state object)
- Always check `response.ok` before parsing
- API responses always have `hasData` boolean — use it to distinguish "no data" from errors
- Error state: set sensible defaults (0, [], null), show muted message

### Navigation
- All dashboard links preserve `?company=` param
- Active detection: exact match for `/dashboard`, prefix match for sub-routes

---

## Your Approach

You are continuing work on the Cosoot project. The approach is:
1. **Read the requirements below** — understand what needs to change
2. **Create a detailed implementation plan** — list every file to create/modify, what changes, and why
3. **Get my approval** on the plan
4. **Implement** — build it step by step, following the conventions above
5. **Test** — verify the dev server runs without errors

Prefer modifying existing files over creating new ones. Keep things simple. No over-engineering.

---

## Step Requirements

<!-- PASTE YOUR SPECIFIC REQUIREMENTS FOR THIS STEP BELOW -->

[YOUR REQUIREMENTS HERE]
