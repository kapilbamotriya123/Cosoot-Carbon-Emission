/**
 * Emissions by Process (Work Center) aggregation logic
 */

import { Pool } from 'pg';
import { TimeRange, calculateYoYChange, YoYChange } from './utils';

export interface ProcessEmission {
  workCenter: string;
  description: string;
  emissions: number;
  yoyChange: YoYChange | null;
}

export interface ProcessEmissionsResponse {
  data: ProcessEmission[];
  totalEmissions: number;
}

/**
 * Calculate process emissions for Meta Engitech
 */
export async function calculateProcessEmissionsMetaEngitech(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<ProcessEmission[]> {
  const { months } = timeRange;
  const previousYear = (parseInt(year) - 1).toString();

  // Get current year data
  const currentQuery = `
    SELECT
      work_center,
      description,
      SUM(CAST(total_intensity AS NUMERIC)) as total_emissions
    FROM emission_by_process_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY work_center, description
    ORDER BY total_emissions DESC
  `;

  const currentResult = await pool.query(currentQuery, [year, months]);

  // Get previous year data
  const previousQuery = `
    SELECT
      work_center,
      SUM(CAST(total_intensity AS NUMERIC)) as total_emissions
    FROM emission_by_process_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY work_center
  `;

  let previousResult;
  try {
    previousResult = await pool.query(previousQuery, [previousYear, months]);
  } catch (error) {
    previousResult = { rows: [] };
  }

  // Create a map of previous year emissions by work center
  const previousMap = new Map<string, number>();
  previousResult.rows.forEach((row) => {
    previousMap.set(row.work_center, parseFloat(row.total_emissions || '0'));
  });

  // Calculate YoY for each work center
  const processEmissions: ProcessEmission[] = currentResult.rows.map((row) => {
    const currentEmissions = parseFloat(row.total_emissions || '0');
    const previousEmissions = previousMap.get(row.work_center) || null;

    return {
      workCenter: row.work_center,
      description: row.description || '',
      emissions: Number(currentEmissions.toFixed(2)),
      yoyChange: calculateYoYChange(currentEmissions, previousEmissions),
    };
  });

  return processEmissions;
}

/**
 * Calculate process emissions for Shakambhari using pre-calculated emission_results_shakambhari
 */
export async function calculateProcessEmissionsShakambhari(
  pool: Pool,
  year: string,
  timeRange: TimeRange
): Promise<ProcessEmission[]> {
  const { months } = timeRange;
  const previousYear = (parseInt(year) - 1).toString();

  // Get current year data from pre-calculated emission_results_shakambhari
  const currentQuery = `
    SELECT
      work_center,
      SUM(CAST(net_total_co2e AS NUMERIC)) as total_emissions
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY work_center
    ORDER BY total_emissions DESC
  `;

  const currentResult = await pool.query(currentQuery, [year, months]);

  // Build work center map from aggregated results
  const workCenterMap = new Map<string, number>();

  currentResult.rows.forEach((row) => {
    const workCenter = row.work_center;
    const totalEmissions = parseFloat(row.total_emissions || '0');
    workCenterMap.set(workCenter, totalEmissions);
  });

  // Get previous year data from pre-calculated emission_results_shakambhari
  const previousQuery = `
    SELECT
      work_center,
      SUM(CAST(net_total_co2e AS NUMERIC)) as total_emissions
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY work_center
  `;

  let previousResult;
  try {
    previousResult = await pool.query(previousQuery, [previousYear, months]);
  } catch (error) {
    previousResult = { rows: [] };
  }

  // Build previous year map
  const previousMap = new Map<string, number>();
  previousResult.rows.forEach((row) => {
    const workCenter = row.work_center;
    const totalEmissions = parseFloat(row.total_emissions || '0');
    previousMap.set(workCenter, totalEmissions);
  });

  // Build process emissions array
  const processEmissions: ProcessEmission[] = [];

  workCenterMap.forEach((emissions, workCenter) => {
    const previousEmissions = previousMap.get(workCenter) || null;

    processEmissions.push({
      workCenter,
      description: '', // Shakambhari doesn't have work center descriptions
      emissions: Number(emissions.toFixed(2)),
      yoyChange: calculateYoYChange(emissions, previousEmissions),
    });
  });

  // Sort by emissions descending
  processEmissions.sort((a, b) => b.emissions - a.emissions);

  return processEmissions;
}

/**
 * Get process emissions for a company
 */
export async function getProcessEmissions(
  pool: Pool,
  company: string,
  year: string,
  timeRange: TimeRange
): Promise<ProcessEmissionsResponse> {
  const isMetaEngitech = company === 'meta_engitech_pune';

  const data = isMetaEngitech
    ? await calculateProcessEmissionsMetaEngitech(pool, year, timeRange)
    : await calculateProcessEmissionsShakambhari(pool, year, timeRange);

  const totalEmissions = data.reduce((sum, item) => sum + item.emissions, 0);

  return {
    data,
    totalEmissions: Number(totalEmissions.toFixed(2)),
  };
}
