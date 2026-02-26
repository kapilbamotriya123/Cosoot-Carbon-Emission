import { pool } from "@/lib/db";
import * as metaDefaults from "./constants";
import * as shakDefaults from "./shakambhari/constants";

// Types matching the JSONB shapes stored in the emission_constants table

export interface MetaEngitechConstants {
  electricity_ef: number;
  lpg_ncv: number;
  lpg_ef: number;
  diesel_ncv: number;
  diesel_ef: number;
  diesel_density: number;
}

export interface ShakambhariConstants {
  electricity_ef: number;
  co2_per_carbon: number;
  carbon_content_map: Record<string, { compName: string; carbonContent: number }>;
}

/**
 * Load Meta Engitech emission constants for a given year/month.
 *
 * Lookup order:
 * 1. DB: exact or most recent previous quarter for this company
 * 2. Fallback: hardcoded values from lib/emissions/constants.ts
 */
export async function loadMetaEngitechConstants(
  year: number,
  month: number
): Promise<MetaEngitechConstants> {
  const quarter = Math.ceil(month / 3);

  const result = await pool.query(
    `SELECT constants FROM emission_constants
     WHERE company_slug = 'meta_engitech_pune'
       AND (year < $1 OR (year = $1 AND quarter <= $2))
     ORDER BY year DESC, quarter DESC
     LIMIT 1`,
    [year, quarter]
  );

  if (result.rows.length > 0) {
    const c = result.rows[0].constants;
    return {
      electricity_ef: c.electricity_ef,
      lpg_ncv: c.lpg_ncv,
      lpg_ef: c.lpg_ef,
      diesel_ncv: c.diesel_ncv,
      diesel_ef: c.diesel_ef,
      diesel_density: c.diesel_density,
    };
  }

  // Fallback to hardcoded file values
  return {
    electricity_ef: metaDefaults.ELECTRICITY_EF,
    lpg_ncv: metaDefaults.LPG_NCV,
    lpg_ef: metaDefaults.LPG_EF,
    diesel_ncv: metaDefaults.DIESEL_NCV,
    diesel_ef: metaDefaults.DIESEL_EF,
    diesel_density: metaDefaults.DIESEL_DENSITY,
  };
}

/**
 * Load Shakambhari emission constants for a given year/month.
 *
 * Lookup order:
 * 1. DB: exact or most recent previous quarter for this company
 * 2. Fallback: hardcoded values from lib/emissions/shakambhari/constants.ts
 */
export async function loadShakambhariConstants(
  year: number,
  month: number
): Promise<ShakambhariConstants> {
  const quarter = Math.ceil(month / 3);

  const result = await pool.query(
    `SELECT constants FROM emission_constants
     WHERE company_slug = 'shakambhari'
       AND (year < $1 OR (year = $1 AND quarter <= $2))
     ORDER BY year DESC, quarter DESC
     LIMIT 1`,
    [year, quarter]
  );

  if (result.rows.length > 0) {
    const c = result.rows[0].constants;
    return {
      electricity_ef: c.electricity_ef,
      co2_per_carbon: c.co2_per_carbon,
      carbon_content_map: c.carbon_content_map,
    };
  }

  // Fallback to hardcoded file values
  return {
    electricity_ef: shakDefaults.ELECTRICITY_EF,
    co2_per_carbon: shakDefaults.CO2_PER_CARBON,
    carbon_content_map: shakDefaults.CARBON_CONTENT_MAP,
  };
}

/**
 * Get the hardcoded default constants for a company.
 * Used by the constants editor to pre-fill the form when no DB entry exists.
 */
export function getDefaultConstants(companySlug: string): MetaEngitechConstants | ShakambhariConstants {
  if (companySlug === "meta_engitech_pune") {
    return {
      electricity_ef: metaDefaults.ELECTRICITY_EF,
      lpg_ncv: metaDefaults.LPG_NCV,
      lpg_ef: metaDefaults.LPG_EF,
      diesel_ncv: metaDefaults.DIESEL_NCV,
      diesel_ef: metaDefaults.DIESEL_EF,
      diesel_density: metaDefaults.DIESEL_DENSITY,
    };
  }
  return {
    electricity_ef: shakDefaults.ELECTRICITY_EF,
    co2_per_carbon: shakDefaults.CO2_PER_CARBON,
    carbon_content_map: shakDefaults.CARBON_CONTENT_MAP,
  };
}
