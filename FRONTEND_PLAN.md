# Cosoot Frontend Execution Plan

## Status: PLANNING

---

## Overview

Build the user-facing dashboard application. The backend (parsing, calculation, storage) is complete for both Meta Engitech and Shakambhari. The frontend currently has only upload pages. We need a proper dashboard with sidebar navigation, data visualization, product flow node diagrams, and role-based access.

**UI Framework:** shadcn/ui (installed, new-york style, neutral base color, lucide icons)
**Node Visualization:** React Flow (to be installed when we reach that phase)

---

## Architecture Decisions (Pre-Build)

### Layout Structure
- **Sidebar (left, ~1/5 width):** Company logo/name at top, navigation menu items, collapsible on mobile
- **Top bar:** Company name, account profile/avatar, admin company selector dropdown
- **Content area (right, ~4/5):** Renders based on selected menu item
- **shadcn Sidebar component** handles responsive behavior (sheet on mobile, fixed on desktop)

### Dark Mode Strategy
- shadcn uses class-based dark mode (`@custom-variant dark (&:is(.dark *))`)
- Currently set up. We'll add a theme toggle later if needed. Default to light mode for now.

### Routing Structure
All dashboard routes under `/dashboard/`:
```
/dashboard                          → Overview/home
/dashboard/emissions/by-product     → Product emission table (both companies)
/dashboard/emissions/by-process     → Process/work center emission table
/dashboard/emissions/summary        → Aggregated summary with charts
/dashboard/product-flow             → Node-based product flow visualization
/dashboard/upload-routing           → (existing) Admin only
/dashboard/upload-consumption       → (existing) Admin only
/dashboard/upload-production        → (existing) Admin only
```

### Company Context
- Top bar has a company selector (dropdown or part of sidebar header)
- Admin: can switch between all companies
- Company user: locked to their company (selector hidden)
- Selected company stored in URL search params (`?company=meta_engitech_pune`) so pages are bookmarkable/shareable
- All data-fetching pages read company from URL params

---

## Build Phases

### Phase 1: Dashboard Shell (Sidebar + Layout + Routing)

**Goal:** Replace the current flat dashboard page with a proper sidebar layout. All existing upload pages work inside the new shell.

**Files to create/modify:**

| # | Action | File | What |
|---|--------|------|------|
| 1 | CREATE | `components/app-sidebar.tsx` | Sidebar component using shadcn Sidebar — navigation menu items, company branding, user profile at bottom |
| 2 | CREATE | `components/company-selector.tsx` | Company dropdown for top bar — admin sees all companies, regular users see only their company |
| 3 | CREATE | `components/top-bar.tsx` | Top bar with company selector + user avatar/profile |
| 4 | MODIFY | `app/dashboard/layout.tsx` | NEW — dashboard layout wrapping all `/dashboard/*` routes with SidebarProvider + Sidebar + TopBar + content area |
| 5 | MODIFY | `app/dashboard/page.tsx` | Simplify to overview/home content (remove navigation links — sidebar handles that now) |
| 6 | MODIFY | `app/dashboard/upload-routing/page.tsx` | Remove standalone nav, rely on sidebar layout |
| 7 | MODIFY | `app/dashboard/upload-consumption/page.tsx` | Same — remove standalone nav |
| 8 | MODIFY | `app/dashboard/upload-production/page.tsx` | Same — remove standalone nav |

**Menu Items (sidebar):**

For all users:
- Overview (home icon)
- By Product (package icon)
- By Process (factory icon)
- Summary (bar chart icon)
- Product Flow (git branch icon)

For admin only:
- **Data Management** section header
- Upload Routing
- Upload Consumption
- Upload Production

**Company list** — hardcoded for now (same as upload pages):
```ts
const COMPANIES = [
  { slug: "meta_engitech_pune", label: "Meta Engitech Pune" },
  { slug: "shakambhari", label: "Shakambhari" },
];
```

**Key shadcn components used:**
- `<SidebarProvider>` + `<Sidebar>` + `<SidebarContent>` + `<SidebarGroup>` + `<SidebarMenu>` + `<SidebarMenuItem>` + `<SidebarMenuButton>`
- `<SidebarTrigger>` for mobile toggle
- `<Select>` for company selector
- `<Avatar>` + `<DropdownMenu>` for user profile

---

### Phase 2: Data Visualization Pages

**Goal:** Build pages that fetch and display calculated emission data from existing API endpoints.

**Pages to build:**

#### 2a. By Product Page (`/dashboard/emissions/by-product`)
- Table view of product emission intensities
- Reads `company` from URL params
- Fetches from `GET /api/emissions/by-product` (Meta Engitech) or new Shakambhari endpoint
- Pagination (existing API supports it)
- Columns vary by company:
  - **Meta Engitech:** product_id, work_center_count, electricity_intensity, lpg_intensity, diesel_intensity, total_intensity, scope1, scope2
  - **Shakambhari:** product_id, product_name, date, total_input_co2e, total_output_co2e, electricity_co2e, net_scope1_co2e, net_total_co2e
- **New API needed:** `GET /api/emissions/shakambhari/by-product` (query emission_results_shakambhari, paginated)

#### 2b. By Process Page (`/dashboard/emissions/by-process`)
- Table view of work center emission data
- **Meta Engitech:** existing `GET /api/emissions/by-process` endpoint
- **Shakambhari:** `GET /api/emissions/shakambhari/by-process` (GROUP BY work_center, SUM aggregates)
- **New API needed:** Shakambhari by-process endpoint

#### 2c. Summary Page (`/dashboard/emissions/summary`)
- High-level KPI cards: total scope 1, total scope 2, total emissions
- Top/bottom emitters
- **Meta Engitech:** existing `GET /api/emissions/summary` endpoint
- **Shakambhari:** new summary endpoint needed
- Charts (add shadcn chart component or use recharts directly)

**New shadcn components to install:** `table`, `pagination`, `badge`, `tabs` (for switching views)

**New API endpoints needed:**
```
GET /api/emissions/shakambhari/by-product?companySlug=X&year=Y&month=M&page=1&pageSize=50
GET /api/emissions/shakambhari/by-process?companySlug=X&year=Y&month=M
GET /api/emissions/shakambhari/summary?companySlug=X&year=Y&month=M
```

---

### Phase 3: Product Flow Node Visualization

**Goal:** Visual node diagram showing how products flow through work centers.

**Library:** React Flow (`@xyflow/react`)

**How it works:**

#### Meta Engitech:
- Product flow data already exists in `routing_data` table (JSONB with products → work centers)
- On first load / after routing upload: generate node positions for all products
- Store generated node layouts in a new DB table `product_flow_nodes`
- Frontend loads pre-computed nodes and renders via React Flow
- Schema: `product_flow_nodes (company_slug, product_id, nodes JSONB, edges JSONB)`

#### Shakambhari:
- Product → work center mapping is in `production_data_shakambhari`
- On production upload: extract unique product → work center flows
- Compare against existing `product_flow_nodes` for this company
- Missing products → generate new node layouts → store
- Existing products → reuse stored nodes (no recomputation)
- **New product detection:** `SELECT DISTINCT product_id FROM production_data_shakambhari WHERE company_slug = $1 AND product_id NOT IN (SELECT product_id FROM product_flow_nodes WHERE company_slug = $1)`

**Node layout algorithm:**
- Simple left-to-right horizontal layout
- Raw material inputs on left → work centers in sequence → finished product on right
- Auto-layout with dagre or elkjs (layout libraries for directed graphs)

**UI:**
- Product selector dropdown (or search) on the page
- Selected product → load its nodes/edges from DB → render in React Flow canvas
- Zoom, pan, minimap

---

### Phase 4: Role-Based Access (Deferred)

**Goal:** Admin sees all companies + upload pages. Company users see only their company.

**Approach (when auth is re-enabled):**
- `companies` table already has `clerk_user_id`
- Middleware checks auth → looks up company mapping → injects into request context
- Admin role: Clerk metadata or separate admin table
- Sidebar conditionally shows admin items
- Company selector: admin gets dropdown, regular user gets static label

**Deferred because:** Auth is intentionally disabled right now. The UI will be structured to support RBAC (admin sections are marked), but enforcement happens when auth comes back.

---

## Component Hierarchy

```
app/dashboard/layout.tsx
├── SidebarProvider
│   ├── AppSidebar (components/app-sidebar.tsx)
│   │   ├── SidebarHeader → Company logo/name
│   │   ├── SidebarContent → Menu groups
│   │   │   ├── Main menu group (Overview, By Product, By Process, Summary, Product Flow)
│   │   │   └── Admin menu group (Upload Routing, Upload Consumption, Upload Production)
│   │   └── SidebarFooter → User profile
│   └── main
│       ├── TopBar (components/top-bar.tsx)
│       │   ├── SidebarTrigger (mobile menu toggle)
│       │   ├── CompanySelector (components/company-selector.tsx)
│       │   └── User avatar + dropdown
│       └── {children} (page content)
```

---

## Implementation Order

1. **Phase 1** — Dashboard shell (sidebar, layout, top bar, company selector)
2. **Phase 2a** — By Product page + Shakambhari by-product API
3. **Phase 2b** — By Process page + Shakambhari by-process API
4. **Phase 2c** — Summary page + Shakambhari summary API
5. **Phase 3** — Product flow node visualization (React Flow + dagre + DB storage)
6. **Phase 4** — Role-based access (when auth is re-enabled)

Each phase is independently deployable. Phase 1 is the foundation — everything else plugs into it.

---

## Dependencies to Install (Per Phase)

**Phase 1:** Already installed (shadcn sidebar, button, select, avatar, dropdown-menu, tooltip, separator, sheet)

**Phase 2:** `npx shadcn add table` + potentially `recharts` for charts

**Phase 3:** `npm install @xyflow/react dagre @types/dagre`

---

## Key Design Choices

1. **Company from URL params** — not React context or localStorage. Makes pages bookmarkable and avoids hydration issues.
2. **Shared layout with conditional admin sections** — one layout for all users, sidebar items conditionally rendered based on role.
3. **Pre-computed node layouts stored in DB** — avoid computing node positions on every page load. Generate once on upload, reuse forever.
4. **New product detection for Shakambhari** — on each monthly upload, diff products against stored nodes, generate only for new ones.
