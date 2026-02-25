# Emission Calculation Documentation

## Purpose
This document maps every emission calculation in the system — what it does, what formula it uses, and where the code lives. If a formula needs to change, this tells you exactly which file to edit.

---

## Two Companies, Two Approaches

| Company | Approach | Unit of Output |
|---------|----------|---------------|
| **Meta Engitech** | Energy-consumption intensity per tonne of production | tCO₂e/t (intensity) |
| **Shakambhari** | Carbon mass-balance (input carbon − output carbon = emitted carbon) | tCO₂e (absolute) |

These are entirely separate codepaths. They only share the electricity emission factor.

---

## Emission Factors

### Meta Engitech — `lib/emissions/constants.ts`

| Factor | Constant | Value | Source |
|--------|----------|-------|--------|
| Electricity EF | `ELECTRICITY_EF` | `0.000598 tCO₂/kWh` | CEA India grid factor (0.598 kg/kWh ÷ 1000) |
| LPG NCV | `LPG_NCV` | `47.3 MJ/kg` | IPCC |
| LPG EF | `LPG_EF` | `63.1 kg CO₂/GJ` | IPCC |
| Diesel NCV | `DIESEL_NCV` | `43 MJ/kg` | IPCC |
| Diesel EF | `DIESEL_EF` | `74.1 kg CO₂/GJ` | IPCC |
| Diesel Density | `DIESEL_DENSITY` | `0.832 kg/L` | Standard |

### Shakambhari — `lib/emissions/shakambhari/constants.ts`

| Factor | Constant | Value | Notes |
|--------|----------|-------|-------|
| Electricity EF | `ELECTRICITY_EF` | `0.000598 tCO₂/kWh` | Same CEA factor |
| CO₂ per Carbon | `CO2_PER_CARBON` | `44/12 = 3.667` | Molecular weight ratio |
| Carbon Content Map | `CARBON_CONTENT_MAP` | ~20 materials | **PLACEHOLDER values** — keyed by `compMat` (material ID), each entry is a fraction 0.0–1.0 |

**Warning:** The `CARBON_CONTENT_MAP` values are placeholders awaiting client confirmation. There's a TODO in the code to move these into a DB table for client-editable values.

---

## Core Calculations

### Meta Engitech — `lib/emissions/calculate.ts`

#### Step 1: Per Work Center (`calculateWorkCenterEmission`)

```
electricity_intensity = (totalEnergyKWh / productionMT) × 0.000598
lpg_intensity         = (lpgConsumptionKg / productionMT) × 47.3 × 63.1 / 1,000,000
diesel_intensity      = (dieselConsumptionLtrs / productionMT) × 43 × 74.1 × 0.832 / 1,000,000

scope1_intensity = lpg_intensity + diesel_intensity
scope2_intensity = electricity_intensity
total_intensity  = scope1_intensity + scope2_intensity
```

All values in **tCO₂e per tonne of production**.
If `productionMT = 0`, all intensities = 0.

**Input:** `consumption_data` table (JSONB with `productionMT`, `totalEnergyKWh`, `lpgConsumptionKg`, `dieselConsumptionLtrs` per work center)
**Output:** `emission_by_process_meta_engitech` table (one row per work center per month)

#### Step 2: Per Product (`calculateByProduct`)

For each product, find its work centers from `routing_data`, then sum the work center intensities:

```
product.electricity = Σ wc.electricity_intensity  (for all matched work centers)
product.lpg         = Σ wc.lpg_intensity
product.diesel      = Σ wc.diesel_intensity
product.scope1      = product.lpg + product.diesel
product.scope2      = product.electricity
product.total       = product.scope1 + product.scope2
```

**Input:** `routing_data` table (JSONB: products → work centers) + work center emissions from Step 1
**Output:** `emission_by_product_meta_engitech` table (one row per product per month)

#### Orchestrator: `lib/emissions/engine.ts`
- Reads routing + consumption from DB
- Calls `calculateAll` (Step 1 + Step 2)
- Writes results using delete-then-insert in a transaction

---

### Shakambhari — `lib/emissions/shakambhari/calculate.ts`

#### Source Classification (`classifySource`)
Each production record has an array of `sources`. Each source is classified as:
- `electricity` → if `compUom == "KWH"`
- `main_product` → if `compMat == parentProductId AND consumedQty == 0 AND byproductQty == 0`
- `byproduct` → if `byproductQty > 0`
- `input` → everything else (raw materials consumed)

#### Per Source (`calculateSourceEmission`)

**Materials** (input, byproduct, main_product):
```
carbon_content = CARBON_CONTENT_MAP[compMat]  (fraction 0.0–1.0)
quantity       = consumedQty (for inputs) | byproductQty (for byproducts) | productionQty (for main product)
co2e           = quantity × carbon_content × (44/12)
```

**Electricity:**
```
co2e = consumedQty × 0.000598
```

#### Per Production Record (`calculateProductEmission`)
```
totalInputCO2e  = Σ co2e for all "input" sources
totalOutputCO2e = Σ co2e for all "main_product" + "byproduct" sources
electricityCO2e = Σ co2e for all "electricity" sources

netScope1CO2e   = totalInputCO2e − totalOutputCO2e
netTotalCO2e    = netScope1CO2e + electricityCO2e
```

**Logic:** Carbon in raw materials, minus carbon retained in finished product/byproducts = carbon emitted as CO₂. Electricity added as Scope 2.

**Input:** `production_data_shakambhari` table (rows with `sources` JSONB array)
**Output:** `emission_results_shakambhari` table (one row per production order with `total_input_co2e`, `total_output_co2e`, `electricity_co2e`, `net_scope1_co2e`, `net_total_co2e`, `source_breakdowns` JSONB)

#### Orchestrator: `lib/emissions/shakambhari/engine.ts`
- Same pattern as Meta Engitech: read from DB → calculate → delete-then-insert

---

## Analytics Layer (Display Aggregation)

These files **do NOT recalculate emissions**. They read pre-calculated results and aggregate for display.

### `lib/analytics/by-scope.ts`
| Company | Query | Returns |
|---------|-------|---------|
| Meta Engitech | SUM of `scope1_intensity`, `scope2_intensity` from `emission_by_product_meta_engitech` | tCO₂/t (intensity sums) |
| Shakambhari | SUM of `net_scope1_co2e`, `electricity_co2e` from `emission_results_shakambhari` | tCO₂e (absolute) |

### `lib/analytics/by-process.ts`
| Company | Query | Returns |
|---------|-------|---------|
| Meta Engitech | SUM of `total_intensity` grouped by `work_center` from `emission_by_process_meta_engitech` | tCO₂/t per WC |
| Shakambhari | SUM of `net_total_co2e` grouped by `work_center` from `emission_results_shakambhari` | tCO₂e per WC |

### `lib/analytics/by-product.ts`
| Company | Query | Returns |
|---------|-------|---------|
| Meta Engitech | AVG of `total_intensity`, `scope1_intensity`, `scope2_intensity` grouped by `product_id` | tCO₂/t averaged across months |
| Shakambhari | SUM of `net_total_co2e` / SUM of `production_qty` grouped by `product_id` | tCO₂e/t (computed at query time) |

### `lib/analytics/by-source.ts`
| Company | Query | Returns |
|---------|-------|---------|
| Meta Engitech | SUM of `electricity_intensity` (Energy) + SUM of `lpg_intensity` + `diesel_intensity` (Materials & Fuels) | Breakdown by source type |
| Shakambhari | SUM of `electricity_co2e` (Energy) + SUM of `net_scope1_co2e` (Materials & Fuels). Drill-down: aggregates `source_breakdowns` JSONB by `compMat` | Top 7 materials + "Others" bucket |

### `lib/analytics/utils.ts`
- `calculateYoYChange(current, previous)` → `{ percent: (current - previous) / previous × 100, absolute: current - previous }`
- `parseTimeRange(period)` → maps Q1/Q2/Q3/Q4/FULL_YEAR to month arrays
- `getPreviousQuarter(year, period)` → determines comparison period

---

## Quick Reference: Where to Edit

| What you want to change | File(s) to edit |
|--------------------------|-----------------|
| Electricity emission factor | `lib/emissions/constants.ts` AND `lib/emissions/shakambhari/constants.ts` |
| LPG/Diesel emission factors | `lib/emissions/constants.ts` |
| LPG/Diesel intensity formula | `lib/emissions/calculate.ts` → `calculateWorkCenterEmission` |
| Carbon content of a Shakambhari material | `lib/emissions/shakambhari/constants.ts` → `CARBON_CONTENT_MAP` |
| How work center emissions roll up to products | `lib/emissions/calculate.ts` → `calculateByProduct` |
| Net emission formula (carbon balance) | `lib/emissions/shakambhari/calculate.ts` → `calculateProductEmission` |
| Source classification rules | `lib/emissions/shakambhari/calculate.ts` → `classifySource` |
| YoY/QoQ comparison logic | `lib/analytics/utils.ts` → `calculateYoYChange` |
| Shakambhari product intensity for display | `lib/analytics/by-product.ts` → `calculateProductEmissionsShakambhari` |
| By-source drill-down breakdown | `lib/analytics/by-source.ts` → Shakambhari section |

---

## Data Flow

```
UPLOAD (Excel files)
├── Meta Engitech
│   ├── Routing Upload → routing_data (JSONB)
│   └── Consumption Upload → consumption_data (JSONB)
│       └── Triggers: lib/emissions/engine.ts
│           ├── → emission_by_process_meta_engitech (per work center per month)
│           └── → emission_by_product_meta_engitech (per product per month)
│
└── Shakambhari
    └── Production Upload → production_data_shakambhari (rows + sources JSONB)
        └── Triggers: lib/emissions/shakambhari/engine.ts
            └── → emission_results_shakambhari (per order per month)

ANALYTICS READ (no recalculation)
├── lib/analytics/by-scope.ts   → Scope 1 + Scope 2 totals
├── lib/analytics/by-process.ts → Per work center
├── lib/analytics/by-product.ts → Per product (with intensity for Shakambhari)
└── lib/analytics/by-source.ts  → By fuel/material source
```

---

## Important Notes

1. **Unit mismatch:** Meta Engitech stores intensities (tCO₂/t). Shakambhari stores absolutes (tCO₂e). The analytics layer handles this transparently but the numbers aren't directly comparable.

2. **Placeholder carbon contents:** The `CARBON_CONTENT_MAP` in Shakambhari constants contains placeholder values. These MUST be replaced with actual lab-verified carbon content values from the client.

3. **After changing any formula:** You need to re-trigger calculation for affected months. Use the calculate API endpoint (`POST /api/emissions/calculate` or `POST /api/emissions/shakambhari/calculate`) with the relevant `companySlug`, `year`, and `month`.
