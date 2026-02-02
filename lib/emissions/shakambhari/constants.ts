// Shakambhari Emission Constants
//
// Carbon content values are PLACEHOLDER — to be replaced with actual values
// from the client. TODO: Move to a DB table for client-editable values per date range.

// --- Electricity ---
// Grid emission factor: 0.598 kg CO₂ per kWh (CEA India grid factor)
// Divide by 1000 to get tCO₂/kWh
export const ELECTRICITY_EF = 0.598 / 1000; // 0.000598 tCO₂/kWh

// --- CO₂ molecular weight ratio ---
// CO₂ molecular weight (44) / Carbon atomic weight (12)
// Used to convert carbon mass to CO₂ equivalent mass
export const CO2_PER_CARBON = 44 / 12;

// --- Carbon Content Map ---
// Maps compMat (material ID) → { compName, carbonContent }
// carbonContent is the mass fraction of carbon in the material (0 to 1)
// Example: 0.82 means 82% carbon by mass (like coke)
//
// Formula: CE = quantity_in_tonnes × carbonContent
//          CO2e = CE × 44/12
//
// IMPORTANT: These are placeholder values in realistic ranges.
// Replace with actual values when provided by client.
export const CARBON_CONTENT_MAP: Record<
  string,
  { compName: string; carbonContent: number }
> = {
  // ── Input Materials (raw materials consumed) ──

  // Manganese ores — low carbon content (carbon is a trace impurity)
  "11000189": { compName: "Manganese Ore (44-46) Sinter IMP", carbonContent: 0.04 },
  "11000032": { compName: "Manganese Ore (30-32) Lumps", carbonContent: 0.3305 },
  "11000142": { compName: "Manganese Ore (20-22) Lumps", carbonContent: 0.3305 },
  "11000190": { compName: "Manganese Ore (34-36) Lumps IMP", carbonContent: 0.3305 },
  "11000191": { compName: "Manganese Ore (44-46) Lumps IMP", carbonContent: 0.3305 },

  // Carbon-rich reductants
  "11000044": { compName: "Lam Coke", carbonContent: 0.82 },
  "11000003": { compName: "Steam Coal (Non Coking)", carbonContent: 0.465 },
  "11000045": { compName: "Pearl Coke", carbonContent: 0.665 },

  // Flux and additives — low carbon
  "11000034": { compName: "Quartz", carbonContent: 0.0 },
  "11000061": { compName: "Dolomite (Size 10-40 MM)", carbonContent: 0.48 },
  "11000060": { compName: "Electrode consumption", carbonContent: 0.822 },

  // Slag inputs (recycled from other processes)
  "11000088": { compName: "Ferro Slag High MNO-Ext", carbonContent: 0.08 },
  "75000028": { compName: "Ferro Slag High MNO", carbonContent: 0.08 },

  // Sand with metal inputs
  "11000033": { compName: "Sand With Metal Silico Manganese", carbonContent: 0.03 },
  "11000086": { compName: "Sand With Metal Ferro Manganese", carbonContent: 0.08 },

  // ── Main Products (output — carbon retained in product) ──

  "70000024": { compName: "Silico Manganese (55-60) Prime", carbonContent: 0.0275 },
  "70000039": { compName: "Silico Manganese (65-70) Prime", carbonContent: 0.03 },
  "70000057": { compName: "Ferro Manganese (75-80) Prime", carbonContent: 0.08 },

  // ── Byproducts (output — carbon retained in byproduct) ──

  "70000032": { compName: "Silico Manganese (0-10)LG", carbonContent: 0.0275 },
  "70000031": { compName: "Silico Manganese-Sizing Chips (0-10)MM", carbonContent: 0.03 },
  "70000062": { compName: "Ferro Manganese-Sizing Chips (0-10)MM", carbonContent: 0.08 },
  "75000033": { compName: "Sand With Metal Silico Manganese", carbonContent: 0.03 },
  "75000034": { compName: "Sand With Metal Ferro Manganese", carbonContent: 0.08 },
  "75000015": { compName: "Disposal Slag", carbonContent: 0.0 },
  "75000026": { compName: "Silico Manganese Buffer Disposal Slag", carbonContent: 0.0 },
  "75000027": { compName: "Ferro Manganese Buffer Disposal Slag", carbonContent: 0.0 },

  // ── Electricity (handled separately — not looked up in this map) ──
  // "70000002": Mix Power — uses ELECTRICITY_EF, not carbon content
};
