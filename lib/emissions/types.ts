// Emission intensity + absolute results for a single work center in a given month
export interface WorkCenterEmission {
  workCenter: string;
  description: string;
  productionMT: number;
  // Intensity: tCO₂e per tonne of production. Zero when productionMT = 0.
  electricityIntensity: number;
  lpgIntensity: number;
  dieselIntensity: number;
  totalIntensity: number;
  scope1Intensity: number; // LPG + Diesel
  scope2Intensity: number; // Electricity
  // Absolute: tCO₂e for the month. Computed from raw consumption (not intensity ×
  // production) so they survive zero-production WCs. These are the canonical
  // numbers for "what did we emit" questions.
  electricityTco2e: number;
  lpgTco2e: number;
  dieselTco2e: number;
  scope1Tco2e: number;
  scope2Tco2e: number;
}

// Emission intensity results for a single product in a given month
export interface ProductEmission {
  productId: string;
  workCenterCount: number; // total WCs in this product's routing
  matchedWorkCenterCount: number; // WCs that had consumption data
  electricityIntensity: number; // tCO2/tonne (sum of WC intensities)
  lpgIntensity: number;
  dieselIntensity: number;
  totalIntensity: number;
  scope1Intensity: number;
  scope2Intensity: number;
}

// Complete calculation output for a company + month
export interface EmissionResults {
  byProcess: WorkCenterEmission[];
  byProduct: ProductEmission[];
}
