// Represents one work center's monthly consumption data
export interface WorkCenterConsumption {
  sequence: number;
  description: string;
  productionMT: number | null;
  uomProduction: string;
  totalEnergyKWh: number | null;
  energyMSEBKWh: number | null;
  energySolarKWh: number | null;
  uomElectEnergy: string;
  lpgConsumptionKg: number | null;
  uomLPG: string;
  dieselConsumptionLtrs: number | null;
  uomDiesel: string;
  dateValue: string | null;
}

// The complete parsed output — keyed by work center code (e.g. "WSLT1")
// so you can do data.WSLT1 to get that work center's consumption
export interface ConsumptionData {
  [workCenterCode: string]: WorkCenterConsumption;
}

// Every company consumption parser must implement this function signature.
// Takes an Excel file as an ArrayBuffer, returns work-center-keyed consumption data.
export type ConsumptionParser = (buffer: ArrayBuffer) => Promise<ConsumptionData>;
