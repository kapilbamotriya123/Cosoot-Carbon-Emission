// Calculation result for a single source (input material, byproduct, main product, or electricity)
export interface SourceEmissionResult {
  compMat: string;
  compName: string;
  compUom: string;
  quantity: number; // consumedQty, byproductQty, or productionQty (in original UOM)
  category: "input" | "byproduct" | "main_product" | "electricity";
  carbonContent: number | null; // null for electricity
  carbonEmission: number; // CE in tonnes of carbon (0 for electricity)
  co2e: number; // tCO₂e
}

// Calculation result for one production record (one product on one date at one work center)
export interface ProductEmissionResult {
  date: string; // YYYY-MM-DD
  year: number;
  month: number;
  workCenter: string;
  productId: string;
  productName: string;
  orderNo: string;
  productionQty: number;
  productionUom: string;

  // Aggregates (all in tCO₂e)
  totalInputCO2e: number; // Σ input source CO₂e
  totalOutputCO2e: number; // Σ main product + byproduct CO₂e
  electricityCO2e: number; // Scope 2 — electricity only
  netScope1CO2e: number; // totalInputCO2e − totalOutputCO2e (process emissions)
  netTotalCO2e: number; // netScope1CO2e + electricityCO2e

  // Per-source detail for drill-down
  sourceBreakdowns: SourceEmissionResult[];
}

// Complete output from the calculation engine
export interface ShakambhariEmissionResults {
  results: ProductEmissionResult[];
  warnings: string[]; // missing carbon content, unexpected UOM, etc.
}
