/**
 * Emissions by Scope aggregation logic
 * Handles both Meta Engitech and Shakambhari
 */

import { Pool } from 'pg';
import { TimeRange, TimePeriod, calculateYoYChange, YoYChange, getPreviousQuarter, parseTimeRange } from './utils';

export interface ScopeEmissions {
  scope1: number; // Direct emissions (tCO₂e)
  scope2: number; // Indirect emissions (tCO₂e)
}

export interface ScopeEmissionsWithYoY {
  current: ScopeEmissions;
  previous: ScopeEmissions | null;
  yoyChange: {
    scope1: YoYChange | null;
    scope2: YoYChange | null;
  };
}

/**
 * Calculate scope emissions for Meta Engitech
 */
export async function calculateScopeEmissionsMetaEngitech(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<ScopeEmissions> {
  const { months } = timeRange;

  // Query emission_by_product_meta_engitech for the selected months
  const query = `
    SELECT
      scope1_intensity,
      scope2_intensity
    FROM emission_by_product_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);

  // Sum all scope1 and scope2 intensities
  let scope1Total = 0;
  let scope2Total = 0;

  result.rows.forEach((row) => {
    scope1Total += parseFloat(row.scope1_intensity || '0');
    scope2Total += parseFloat(row.scope2_intensity || '0');
  });

  return {
    scope1: Number(scope1Total.toFixed(2)),
    scope2: Number(scope2Total.toFixed(2)),
  };
}

/**
 * Calculate scope emissions for Shakambhari using pre-calculated emission_results_shakambhari
 * Scope 1 = net_scope1_co2e (Direct emissions from materials)
 * Scope 2 = electricity_co2e (Indirect emissions from electricity)
 */
export async function calculateScopeEmissionsShakambhari(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<ScopeEmissions> {
  const { months } = timeRange;

  // Query emission_results_shakambhari for the selected months
  const query = `
    SELECT
      SUM(CAST(net_scope1_co2e AS NUMERIC)) as total_scope1,
      SUM(CAST(electricity_co2e AS NUMERIC)) as total_scope2
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
  `;

  const result = await pool.query(query, [year, months]);

  const row = result.rows[0];
  const scope1Total = parseFloat(row?.total_scope1 || '0');
  const scope2Total = parseFloat(row?.total_scope2 || '0');

  return {
    scope1: Number(scope1Total.toFixed(2)),
    scope2: Number(scope2Total.toFixed(2)),
  };
}

/**
 * Get scope emissions with YoY/QoQ comparison
 */
export async function getScopeEmissionsWithYoY(
  pool: Pool,
  company: string,
  year: string,
  period: TimePeriod,
  timeRange: TimeRange
): Promise<ScopeEmissionsWithYoY> {
  const isMetaEngitech = company === 'meta_engitech_pune';

  // Get previous period for comparison (QoQ if quarter, YoY if full year)
  const { year: prevYear, period: prevPeriod } = getPreviousQuarter(year, period);
  const prevTimeRange = parseTimeRange(prevPeriod);

  // Calculate current period emissions
  const current = isMetaEngitech
    ? await calculateScopeEmissionsMetaEngitech(pool, year, timeRange)
    : await calculateScopeEmissionsShakambhari(pool, year, timeRange);

  // Calculate previous period emissions
  let previous: ScopeEmissions | null = null;
  try {
    previous = isMetaEngitech
      ? await calculateScopeEmissionsMetaEngitech(pool, prevYear, prevTimeRange)
      : await calculateScopeEmissionsShakambhari(pool, prevYear, prevTimeRange);
  } catch (error) {
    // No data for previous period
    previous = null;
  }

  // Calculate YoY/QoQ changes
  const yoyChange = {
    scope1: calculateYoYChange(current.scope1, previous?.scope1 || null),
    scope2: calculateYoYChange(current.scope2, previous?.scope2 || null),
  };

  return {
    current,
    previous,
    yoyChange,
  };
}
