/**
 * Emissions by Source aggregation logic
 * Two categories: Materials & Fuels, and Energy (Electricity)
 */

import { Pool } from 'pg';
import { TimeRange, calculateYoYChange, YoYChange } from './utils';

export interface SourceEmissions {
  materialsAndFuels: number; // tCO₂e
  energy: number; // tCO₂e (electricity)
}

export interface SourceEmissionsWithYoY {
  current: SourceEmissions;
  previous: SourceEmissions | null;
  yoyChange: {
    materialsAndFuels: YoYChange | null;
    energy: YoYChange | null;
  };
}

/**
 * Calculate source emissions for Meta Engitech
 * Materials & Fuels = LPG + Diesel
 * Energy = Electricity
 */
export async function calculateSourceEmissionsMetaEngitech(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<SourceEmissions> {
  const { months } = timeRange;

  const query = `
    SELECT
      electricity_intensity,
      lpg_intensity,
      diesel_intensity
    FROM emission_by_product_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);

  let energyTotal = 0; // Electricity
  let materialsTotal = 0; // LPG + Diesel

  result.rows.forEach((row) => {
    energyTotal += parseFloat(row.electricity_intensity || '0');
    materialsTotal += parseFloat(row.lpg_intensity || '0') + parseFloat(row.diesel_intensity || '0');
  });

  return {
    materialsAndFuels: Number(materialsTotal.toFixed(2)),
    energy: Number(energyTotal.toFixed(2)),
  };
}

/**
 * Calculate source emissions for Shakambhari using pre-calculated emission_results_shakambhari
 * Materials & Fuels = net_scope1_co2e (Direct emissions from materials)
 * Energy = electricity_co2e (Electricity)
 */
export async function calculateSourceEmissionsShakambhari(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<SourceEmissions> {
  const { months } = timeRange;

  const query = `
    SELECT
      SUM(CAST(net_scope1_co2e AS NUMERIC)) as total_materials,
      SUM(CAST(electricity_co2e AS NUMERIC)) as total_energy
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);

  const row = result.rows[0];
  const materialsTotal = parseFloat(row?.total_materials || '0');
  const energyTotal = parseFloat(row?.total_energy || '0');

  return {
    materialsAndFuels: Number(materialsTotal.toFixed(2)),
    energy: Number(energyTotal.toFixed(2)),
  };
}

/**
 * Get source emissions with YoY comparison
 */
export async function getSourceEmissionsWithYoY(
  pool: Pool,
  company: string,
  year: string,
  timeRange: TimeRange
): Promise<SourceEmissionsWithYoY> {
  const isMetaEngitech = company === 'meta_engitech_pune';
  const previousYear = (parseInt(year) - 1).toString();

  // Calculate current year emissions
  const current = isMetaEngitech
    ? await calculateSourceEmissionsMetaEngitech(pool, year, timeRange)
    : await calculateSourceEmissionsShakambhari(pool, year, timeRange);

  // Calculate previous year emissions
  let previous: SourceEmissions | null = null;
  try {
    previous = isMetaEngitech
      ? await calculateSourceEmissionsMetaEngitech(pool, previousYear, timeRange)
      : await calculateSourceEmissionsShakambhari(pool, previousYear, timeRange);
  } catch (error) {
    previous = null;
  }

  // Calculate YoY changes
  const yoyChange = {
    materialsAndFuels: calculateYoYChange(
      current.materialsAndFuels,
      previous?.materialsAndFuels || null
    ),
    energy: calculateYoYChange(current.energy, previous?.energy || null),
  };

  return {
    current,
    previous,
    yoyChange,
  };
}
