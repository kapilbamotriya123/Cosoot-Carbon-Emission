// Emission intensity results for a single work center in a given month
export interface WorkCenterEmission {
  workCenter: string;
  description: string;
  productionMT: number;
  electricityIntensity: number; // tCO2/tonne
  lpgIntensity: number; // tCO2/tonne
  dieselIntensity: number; // tCO2/tonne
  totalIntensity: number; // tCO2/tonne (sum of above three)
  scope1Intensity: number; // tCO2/tonne (LPG + Diesel — Direct)
  scope2Intensity: number; // tCO2/tonne (Electricity — Indirect)
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
