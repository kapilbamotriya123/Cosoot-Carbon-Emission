// Emission conversion constants
// Sources: IPCC guidelines, CEA (Central Electricity Authority) India grid factor

// --- Electricity ---
// Grid emission factor: 0.598 kg CO₂ per kWh
// Divide by 1000 to convert kg → tonne
// Result unit: tCO₂ per kWh
export const ELECTRICITY_EF = 0.598 / 1000; // 0.000598 tCO₂/kWh

// --- LPG ---
// Net Calorific Value: 47.3 MJ/kg
// CO₂ emission factor: 63.1 kg CO₂/GJ
// Combined: 47.3 × 63.1 = 2984.63 kg CO₂ per 1000 kg (per tonne of LPG)
// Divide by 1,000,000 to normalize units (MJ→GJ and kg CO₂→tCO₂)
// Result unit: tCO₂ per kg of LPG
export const LPG_NCV = 47.3; // MJ/kg
export const LPG_EF = 63.1; // kg CO₂/GJ

// --- Diesel ---
// Net Calorific Value: 43 MJ/kg
// CO₂ emission factor: 74.1 kg CO₂/GJ
// Density: 0.832 kg/L (to convert litres → kg)
// Divide by 1,000,000 to normalize units
// Result unit: tCO₂ per litre of diesel
export const DIESEL_NCV = 43; // MJ/kg
export const DIESEL_EF = 74.1; // kg CO₂/GJ
export const DIESEL_DENSITY = 0.832; // kg/L
