/**
 * Emissions by Source aggregation logic
 * Two categories: Materials & Fuels, and Energy (Electricity)
 */

import { Pool } from 'pg';
import { TimeRange, TimePeriod, calculateYoYChange, YoYChange, getPreviousQuarter, parseTimeRange } from './utils';

export interface SourceEmissions {
  materialsAndFuels: number; // tCO₂e
  energy: number; // tCO₂e (electricity)
}

export interface SourceDetail {
  compMat: string;      // Material ID (e.g., "11000044")
  compName: string;     // Human name (e.g., "Lam Coke")
  co2e: number;        // CO₂e emissions (tCO₂e)
  category: 'input' | 'electricity';
}

export interface SourceBreakdown {
  materialsAndFuels: SourceDetail[];  // Top 7 + Others
  energy: SourceDetail[];             // Mix Power
}

export interface SourceEmissionsWithYoY {
  current: SourceEmissions;
  previous: SourceEmissions | null;
  yoyChange: {
    materialsAndFuels: YoYChange | null;
    energy: YoYChange | null;
  };
  breakdown: SourceBreakdown;
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
 * Calculate source-level breakdown for Meta Engitech
 * Diesel and LPG as separate sources
 */
export async function calculateSourceBreakdownMetaEngitech(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<SourceBreakdown> {
  const { months } = timeRange;

  const query = `
    SELECT
      SUM(CAST(electricity_intensity AS NUMERIC)) as total_electricity,
      SUM(CAST(lpg_intensity AS NUMERIC)) as total_lpg,
      SUM(CAST(diesel_intensity AS NUMERIC)) as total_diesel
    FROM emission_by_product_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);
  const row = result.rows[0];

  const lpgTotal = parseFloat(row?.total_lpg || '0');
  const dieselTotal = parseFloat(row?.total_diesel || '0');
  const electricityTotal = parseFloat(row?.total_electricity || '0');

  // Materials & Fuels: LPG and Diesel
  const materialsAndFuels: SourceDetail[] = [];

  if (dieselTotal > 0) {
    materialsAndFuels.push({
      compMat: 'DIESEL',
      compName: 'Diesel',
      co2e: Number(dieselTotal.toFixed(2)),
      category: 'input',
    });
  }

  if (lpgTotal > 0) {
    materialsAndFuels.push({
      compMat: 'LPG',
      compName: 'LPG',
      co2e: Number(lpgTotal.toFixed(2)),
      category: 'input',
    });
  }

  // Sort by emissions descending
  materialsAndFuels.sort((a, b) => b.co2e - a.co2e);

  // Energy: Electricity
  const energy: SourceDetail[] = [];
  if (electricityTotal > 0) {
    energy.push({
      compMat: 'ELECTRICITY',
      compName: 'Electricity',
      co2e: Number(electricityTotal.toFixed(2)),
      category: 'electricity',
    });
  }

  return {
    materialsAndFuels,
    energy,
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
 * Calculate source-level breakdown for Shakambhari
 * Extracts individual sources from JSONB, aggregates, returns top 7 + Others
 */
export async function calculateSourceBreakdownShakambhari(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<SourceBreakdown> {
  const { months } = timeRange;

  const query = `
    SELECT source_breakdowns
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);

  const materialsMap = new Map<string, { compName: string; co2e: number }>();
  const energyMap = new Map<string, { compName: string; co2e: number }>();

  result.rows.forEach((row) => {
    const breakdowns = row.source_breakdowns as Array<{
      compMat: string;
      compName: string;
      co2e: number;
      category: 'input' | 'byproduct' | 'main_product' | 'electricity';
    }>;

    if (!breakdowns || !Array.isArray(breakdowns)) return;

    breakdowns.forEach((source) => {
      if (source.category === 'input') {
        const existing = materialsMap.get(source.compMat);
        materialsMap.set(source.compMat, {
          compName: source.compName,
          co2e: (existing?.co2e || 0) + source.co2e,
        });
      } else if (source.category === 'electricity') {
        const existing = energyMap.get(source.compMat);
        energyMap.set(source.compMat, {
          compName: source.compName,
          co2e: (existing?.co2e || 0) + source.co2e,
        });
      }
    });
  });

  const sortedMaterials = Array.from(materialsMap.entries())
    .map(([compMat, data]) => ({
      compMat,
      compName: data.compName,
      co2e: Number(data.co2e.toFixed(2)),
      category: 'input' as const,
    }))
    .sort((a, b) => b.co2e - a.co2e);

  const top7 = sortedMaterials.slice(0, 7);
  const othersTotal = sortedMaterials
    .slice(7)
    .reduce((sum, s) => sum + s.co2e, 0);

  const materialsAndFuels: SourceDetail[] = [...top7];
  if (othersTotal > 0) {
    materialsAndFuels.push({
      compMat: 'OTHERS',
      compName: 'Others',
      co2e: Number(othersTotal.toFixed(2)),
      category: 'input',
    });
  }

  const energy: SourceDetail[] = Array.from(energyMap.entries()).map(
    ([compMat, data]) => ({
      compMat,
      compName: data.compName,
      co2e: Number(data.co2e.toFixed(2)),
      category: 'electricity' as const,
    })
  );

  return {
    materialsAndFuels,
    energy,
  };
}

/**
 * Get source emissions with YoY/QoQ comparison
 */
export async function getSourceEmissionsWithYoY(
  pool: Pool,
  company: string,
  year: string,
  period: TimePeriod,
  timeRange: TimeRange
): Promise<SourceEmissionsWithYoY> {
  const isMetaEngitech = company === 'meta_engitech_pune';

  // Get previous period for comparison (QoQ if quarter, YoY if full year)
  const { year: prevYear, period: prevPeriod } = getPreviousQuarter(year, period);
  const prevTimeRange = parseTimeRange(prevPeriod);

  // Calculate current period emissions
  const current = isMetaEngitech
    ? await calculateSourceEmissionsMetaEngitech(pool, year, timeRange)
    : await calculateSourceEmissionsShakambhari(pool, year, timeRange);

  // Calculate previous period emissions
  let previous: SourceEmissions | null = null;
  try {
    previous = isMetaEngitech
      ? await calculateSourceEmissionsMetaEngitech(pool, prevYear, prevTimeRange)
      : await calculateSourceEmissionsShakambhari(pool, prevYear, prevTimeRange);
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

  // Get source breakdown for both companies
  let breakdown: SourceBreakdown = {
    materialsAndFuels: [],
    energy: [],
  };

  try {
    breakdown = isMetaEngitech
      ? await calculateSourceBreakdownMetaEngitech(pool, year, timeRange)
      : await calculateSourceBreakdownShakambhari(pool, year, timeRange);
  } catch (error) {
    console.error('Error calculating source breakdown:', error);
  }

  return {
    current,
    previous,
    yoyChange,
    breakdown,
  };
}
