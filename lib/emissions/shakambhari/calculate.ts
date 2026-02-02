import type { ProductionRecord, ProductionSource } from "@/lib/parsers/production/types";
import type {
  SourceEmissionResult,
  ProductEmissionResult,
  ShakambhariEmissionResults,
} from "./types";
import { CARBON_CONTENT_MAP, ELECTRICITY_EF, CO2_PER_CARBON } from "./constants";

/**
 * Classify a source into one of 4 categories:
 * - "electricity": compUom is KWH (e.g. Mix Power)
 * - "main_product": compMat matches parent productId AND both consumed/byproduct are 0
 * - "byproduct": byproductQty > 0
 * - "input": consumedQty > 0 (raw material consumed in production)
 */
function classifySource(
  source: ProductionSource,
  parentProductId: string
): "input" | "byproduct" | "main_product" | "electricity" {
  if (source.compUom.toUpperCase() === "KWH") return "electricity";
  if (
    source.compMat === parentProductId &&
    source.consumedQty === 0 &&
    source.byproductQty === 0
  )
    return "main_product";
  if (source.byproductQty > 0) return "byproduct";
  return "input";
}

/**
 * Calculate emission for a single source.
 *
 * For materials: CE = qty × carbonContent, CO2e = CE × 44/12
 * For electricity: CO2e = kWh × electricityEF (no carbon content concept)
 * For main_product: qty comes from parent record's productionQty
 *
 * If carbon content is missing, emits a warning and treats emission as 0.
 */
function calculateSourceEmission(
  source: ProductionSource,
  category: "input" | "byproduct" | "main_product" | "electricity",
  productionQty: number,
  warnings: string[],
  context: string
): SourceEmissionResult {
  // --- Electricity: separate formula ---
  if (category === "electricity") {
    const co2e = source.consumedQty * ELECTRICITY_EF;
    return {
      compMat: source.compMat,
      compName: source.compName,
      compUom: source.compUom,
      quantity: source.consumedQty,
      category,
      carbonContent: null,
      carbonEmission: 0,
      co2e,
    };
  }

  // --- Determine quantity based on category ---
  let qty: number;
  if (category === "main_product") {
    qty = productionQty; // from the parent production record
  } else if (category === "byproduct") {
    qty = source.byproductQty;
  } else {
    qty = source.consumedQty;
  }

  // --- Look up carbon content ---
  const ccEntry = CARBON_CONTENT_MAP[source.compMat];
  if (!ccEntry) {
    warnings.push(
      `Missing carbon content for ${source.compMat} (${source.compName}) in ${context}`
    );
    return {
      compMat: source.compMat,
      compName: source.compName,
      compUom: source.compUom,
      quantity: qty,
      category,
      carbonContent: null,
      carbonEmission: 0,
      co2e: 0,
    };
  }

  // --- CE = qty × carbonContent, CO2e = CE × 44/12 ---
  const ce = qty * ccEntry.carbonContent;
  const co2e = ce * CO2_PER_CARBON;

  return {
    compMat: source.compMat,
    compName: source.compName,
    compUom: source.compUom,
    quantity: qty,
    category,
    carbonContent: ccEntry.carbonContent,
    carbonEmission: ce,
    co2e,
  };
}

/**
 * Calculate emissions for a single production record.
 *
 * Net emission = Input CO2e − (Main Product CO2e + Byproduct CO2e)
 * This is Scope 1 (process emissions — carbon that entered but didn't leave in product/byproduct).
 * Electricity is Scope 2 (indirect).
 * Total = Scope 1 + Scope 2.
 */
export function calculateProductEmission(
  record: ProductionRecord,
  warnings: string[]
): ProductEmissionResult {
  const context = `product ${record.productId} (${record.productName}) on ${record.date} at ${record.workCenter}`;
  const sourceBreakdowns: SourceEmissionResult[] = [];

  let totalInputCO2e = 0;
  let totalOutputCO2e = 0;
  let electricityCO2e = 0;

  for (const source of record.sources) {
    const category = classifySource(source, record.productId);
    const result = calculateSourceEmission(
      source,
      category,
      record.productionQty,
      warnings,
      context
    );
    sourceBreakdowns.push(result);

    switch (category) {
      case "input":
        totalInputCO2e += result.co2e;
        break;
      case "byproduct":
      case "main_product":
        totalOutputCO2e += result.co2e;
        break;
      case "electricity":
        electricityCO2e += result.co2e;
        break;
    }
  }

  const netScope1CO2e = totalInputCO2e - totalOutputCO2e;

  return {
    date: record.date,
    year: record.year,
    month: record.month,
    workCenter: record.workCenter,
    productId: record.productId,
    productName: record.productName,
    orderNo: record.orderNo,
    productionQty: record.productionQty,
    productionUom: record.productionUom,
    totalInputCO2e,
    totalOutputCO2e,
    electricityCO2e,
    netScope1CO2e,
    netTotalCO2e: netScope1CO2e + electricityCO2e,
    sourceBreakdowns,
  };
}

/**
 * Calculate emissions for all production records.
 * Pure function — no DB access, no side effects.
 */
export function calculateAll(
  records: ProductionRecord[]
): ShakambhariEmissionResults {
  const warnings: string[] = [];
  const results = records.map((r) => calculateProductEmission(r, warnings));

  // Deduplicate warnings (same material can be missing across many records)
  const uniqueWarnings = [...new Set(warnings)];

  return { results, warnings: uniqueWarnings };
}
