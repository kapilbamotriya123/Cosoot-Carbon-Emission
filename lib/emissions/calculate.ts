import type { ConsumptionData, WorkCenterConsumption } from "@/lib/parsers/consumption/types";
import type { RoutingData } from "@/lib/parsers/types";
import type { WorkCenterEmission, ProductEmission, EmissionResults } from "./types";
import { ELECTRICITY_EF, LPG_NCV, LPG_EF, DIESEL_NCV, DIESEL_EF, DIESEL_DENSITY } from "./constants";

/**
 * Calculate emission intensity for a single work center.
 *
 * Each formula converts consumption per tonne of production into tCO₂/tonne:
 *   Electricity: (kWh / MT) × 0.598 / 1000
 *   LPG:         (kg / MT) × 47.3 × 63.1 / 1,000,000
 *   Diesel:      (L / MT) × 43 × 74.1 × 0.832 / 1,000,000
 *
 * Returns 0 for any source where data is null or production is 0.
 */
export function calculateWorkCenterEmission(
  workCenter: string,
  wc: WorkCenterConsumption
): WorkCenterEmission {
  const production = wc.productionMT ?? 0;

  // Can't calculate intensity without production
  if (production === 0) {
    return {
      workCenter,
      description: wc.description,
      productionMT: 0,
      electricityIntensity: 0,
      lpgIntensity: 0,
      dieselIntensity: 0,
      totalIntensity: 0,
      scope1Intensity: 0,
      scope2Intensity: 0,
    };
  }

  const elec = ((wc.totalEnergyKWh ?? 0) / production) * ELECTRICITY_EF;
  const lpg = ((wc.lpgConsumptionKg ?? 0) / production) * LPG_NCV * LPG_EF / 1_000_000;
  const diesel =
    ((wc.dieselConsumptionLtrs ?? 0) / production) * DIESEL_NCV * DIESEL_EF * DIESEL_DENSITY / 1_000_000;

  const scope1 = lpg + diesel;
  const scope2 = elec;
  const total = scope1 + scope2;

  return {
    workCenter,
    description: wc.description,
    productionMT: production,
    electricityIntensity: elec,
    lpgIntensity: lpg,
    dieselIntensity: diesel,
    totalIntensity: total,
    scope1Intensity: scope1,
    scope2Intensity: scope2,
  };
}

/**
 * Calculate emission intensities for all work centers in consumption data.
 */
export function calculateByProcess(
  consumption: ConsumptionData
): WorkCenterEmission[] {
  return Object.entries(consumption).map(([wcCode, wcData]) =>
    calculateWorkCenterEmission(wcCode, wcData)
  );
}

/**
 * Calculate emission intensities for all products.
 *
 * For each product, we find its unique work centers from routing data,
 * then sum up each matched work center's intensity.
 * This is "Approach A" — sum of individual WC intensities, as specified by the client.
 */
export function calculateByProduct(
  routing: RoutingData,
  processEmissions: WorkCenterEmission[]
): ProductEmission[] {
  // Build lookup map: work center code → emission data
  const wcMap = new Map<string, WorkCenterEmission>();
  for (const wc of processEmissions) {
    wcMap.set(wc.workCenter, wc);
  }

  // --- DEBUG: pick 3-4 sample products to log ---
  // Find products whose work centers have non-zero emissions across sources
  const debugProductIds = pickDebugProducts(routing, wcMap, 4);
  if (debugProductIds.size > 0) {
    console.log(`\n[emissions:debug] === BY-PRODUCT CALCULATION TRACE ===`);
    console.log(`[emissions:debug] Tracing ${debugProductIds.size} sample products: ${[...debugProductIds].join(", ")}`);
    console.log(`[emissions:debug] WC map has ${wcMap.size} work centers\n`);
  }

  return routing.products.map((product) => {
    // Get unique work centers for this product
    const uniqueWCs = new Set<string>();
    for (const row of product.rows) {
      if (row.workCenter) {
        uniqueWCs.add(row.workCenter);
      }
    }

    const shouldLog = debugProductIds.has(product.productId);

    if (shouldLog) {
      console.log(`[emissions:debug] ── Product: ${product.productId}`);
      console.log(`[emissions:debug]    Routing rows: ${product.rows.length}, Unique WCs: ${[...uniqueWCs].join(", ")}`);
    }

    let elec = 0;
    let lpg = 0;
    let diesel = 0;
    let matched = 0;

    for (const wcCode of uniqueWCs) {
      const wcEmission = wcMap.get(wcCode);
      if (wcEmission) {
        matched++;
        elec += wcEmission.electricityIntensity;
        lpg += wcEmission.lpgIntensity;
        diesel += wcEmission.dieselIntensity;

        if (shouldLog) {
          console.log(`[emissions:debug]    WC ${wcCode} (${wcEmission.description}): prod=${wcEmission.productionMT}MT | elec=${wcEmission.electricityIntensity.toFixed(8)} | lpg=${wcEmission.lpgIntensity.toFixed(8)} | diesel=${wcEmission.dieselIntensity.toFixed(8)}`);
        }
      } else if (shouldLog) {
        console.log(`[emissions:debug]    WC ${wcCode}: NOT FOUND in consumption data → skipped`);
      }
    }

    const scope1 = lpg + diesel;
    const scope2 = elec;
    const total = scope1 + scope2;

    if (shouldLog) {
      console.log(`[emissions:debug]    RESULT → matched ${matched}/${uniqueWCs.size} WCs | elec=${elec.toFixed(8)} | lpg=${lpg.toFixed(8)} | diesel=${diesel.toFixed(8)} | total=${total.toFixed(8)}`);
      console.log(`[emissions:debug]    SCOPES → scope1(LPG+Diesel)=${scope1.toFixed(8)} | scope2(Elec)=${scope2.toFixed(8)}\n`);
    }

    return {
      productId: product.productId,
      workCenterCount: uniqueWCs.size,
      matchedWorkCenterCount: matched,
      electricityIntensity: elec,
      lpgIntensity: lpg,
      dieselIntensity: diesel,
      totalIntensity: total,
      scope1Intensity: scope1,
      scope2Intensity: scope2,
    };
  });
}

/**
 * Pick up to `count` products that have work centers with diverse emission sources.
 * Prefers products where at least one WC has non-zero elec, lpg, or diesel.
 */
function pickDebugProducts(
  routing: RoutingData,
  wcMap: Map<string, WorkCenterEmission>,
  count: number
): Set<string> {
  const picked = new Set<string>();

  for (const product of routing.products) {
    if (picked.size >= count) break;

    let hasElec = false;
    let hasLpg = false;
    let hasDiesel = false;

    for (const row of product.rows) {
      const wc = wcMap.get(row.workCenter);
      if (!wc) continue;
      if (wc.electricityIntensity > 0) hasElec = true;
      if (wc.lpgIntensity > 0) hasLpg = true;
      if (wc.dieselIntensity > 0) hasDiesel = true;
    }

    // Prefer products with all 3 sources, then 2, then 1
    const sourceCount = (hasElec ? 1 : 0) + (hasLpg ? 1 : 0) + (hasDiesel ? 1 : 0);
    if (sourceCount >= 2) {
      picked.add(product.productId);
    } else if (sourceCount >= 1 && picked.size < count - 1) {
      // Leave room for better candidates
      picked.add(product.productId);
    }
  }

  // If we didn't find enough, just pick the first few products
  if (picked.size < count) {
    for (const product of routing.products) {
      if (picked.size >= count) break;
      picked.add(product.productId);
    }
  }

  return picked;
}

/**
 * Calculate everything: by-process and by-product emissions for a given month.
 */
export function calculateAll(
  routing: RoutingData,
  consumption: ConsumptionData
): EmissionResults {
  const byProcess = calculateByProcess(consumption);
  const byProduct = calculateByProduct(routing, byProcess);
  return { byProcess, byProduct };
}
