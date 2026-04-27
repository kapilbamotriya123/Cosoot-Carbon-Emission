/**
 * Emissions by Product aggregation logic
 */

import { Pool } from 'pg';
import { TimeRange, TimePeriod, calculateYoYChange, YoYChange, getPreviousQuarter, parseTimeRange } from './utils';

export interface ProductEmission {
  productId: string;
  productName: string;
  emissionIntensity: number; // tCO₂e per tonne of product
  directEmission: number; // Scope 1
  indirectEmission: number; // Scope 2
  yoyChange: YoYChange | null;
}

export interface ProductEmissionsResponse {
  data: ProductEmission[];
  avgIntensity: number;
  totalProducts: number;
}

/**
 * Calculate product emissions for Meta Engitech
 */
export async function calculateProductEmissionsMetaEngitech(
  pool: Pool,
  year: string,
  period: TimePeriod,
  timeRange: TimeRange,
  search?: string
): Promise<ProductEmission[]> {
  const { months } = timeRange;

  // Get previous period for comparison (QoQ if quarter, YoY if full year)
  const { year: prevYear, period: prevPeriod } = getPreviousQuarter(year, period);
  const prevTimeRange = parseTimeRange(prevPeriod);

  const searchTerm = search?.trim();
  const currentParams: unknown[] = [year, months];
  let searchClause = '';
  if (searchTerm) {
    currentParams.push(`%${searchTerm}%`);
    searchClause = `AND product_id ILIKE $${currentParams.length}`;
  }

  // Get current year data
  const currentQuery = `
    SELECT
      product_id,
      AVG(CAST(total_intensity AS NUMERIC)) as avg_intensity,
      AVG(CAST(scope1_intensity AS NUMERIC)) as avg_scope1,
      AVG(CAST(scope2_intensity AS NUMERIC)) as avg_scope2
    FROM emission_by_product_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
      ${searchClause}
    GROUP BY product_id
    ORDER BY avg_intensity DESC
  `;

  const currentResult = await pool.query(currentQuery, currentParams);

  // Get previous year data
  const previousQuery = `
    SELECT
      product_id,
      AVG(CAST(total_intensity AS NUMERIC)) as avg_intensity
    FROM emission_by_product_meta_engitech
    WHERE company_slug = 'meta_engitech_pune'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY product_id
  `;

  let previousResult;
  try {
    previousResult = await pool.query(previousQuery, [prevYear, prevTimeRange.months]);
  } catch (error) {
    previousResult = { rows: [] };
  }

  // Create a map of previous period emissions
  const previousMap = new Map<string, number>();
  previousResult.rows.forEach((row) => {
    previousMap.set(row.product_id, parseFloat(row.avg_intensity || '0'));
  });

  // Build product emissions array
  const productEmissions: ProductEmission[] = currentResult.rows.map((row) => {
    const currentIntensity = parseFloat(row.avg_intensity || '0');
    const previousIntensity = previousMap.get(row.product_id) || null;

    return {
      productId: row.product_id,
      productName: '', // Meta Engitech doesn't have product names in the table
      emissionIntensity: Number(currentIntensity.toFixed(2)),
      directEmission: Number(parseFloat(row.avg_scope1 || '0').toFixed(2)),
      indirectEmission: Number(parseFloat(row.avg_scope2 || '0').toFixed(2)),
      yoyChange: calculateYoYChange(currentIntensity, previousIntensity),
    };
  });

  return productEmissions;
}

/**
 * Calculate product emissions for Shakambhari using pre-calculated emission_results_shakambhari
 */
export async function calculateProductEmissionsShakambhari(
  pool: Pool,
  year: string,
  period: TimePeriod,
  timeRange: TimeRange,
  search?: string
): Promise<ProductEmission[]> {
  const { months } = timeRange;

  // Get previous period for comparison (QoQ if quarter, YoY if full year)
  const { year: prevYear, period: prevPeriod } = getPreviousQuarter(year, period);
  const prevTimeRange = parseTimeRange(prevPeriod);

  const searchTerm = search?.trim();
  const currentParams: unknown[] = [year, months];
  let searchClause = '';
  if (searchTerm) {
    currentParams.push(`%${searchTerm}%`);
    searchClause = `AND (product_id ILIKE $${currentParams.length} OR product_name ILIKE $${currentParams.length})`;
  }

  // Get current year data from pre-calculated emission_results_shakambhari
  const currentQuery = `
    SELECT
      product_id,
      product_name,
      SUM(CAST(production_qty AS NUMERIC)) as total_production,
      SUM(CAST(net_scope1_co2e AS NUMERIC)) as total_scope1,
      SUM(CAST(electricity_co2e AS NUMERIC)) as total_scope2,
      SUM(CAST(net_total_co2e AS NUMERIC)) as total_emissions
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
      ${searchClause}
    GROUP BY product_id, product_name
  `;

  const currentResult = await pool.query(currentQuery, currentParams);

  // Build product map from aggregated results
  const productMap = new Map<string, {
    productName: string;
    totalEmissions: number;
    totalProduction: number;
    scope1: number;
    scope2: number;
  }>();

  currentResult.rows.forEach((row) => {
    const productId = row.product_id;
    const productName = row.product_name;
    const totalProduction = parseFloat(row.total_production || '0');
    const scope1 = parseFloat(row.total_scope1 || '0');
    const scope2 = parseFloat(row.total_scope2 || '0');
    const totalEmissions = parseFloat(row.total_emissions || '0');

    productMap.set(productId, {
      productName,
      totalEmissions,
      totalProduction,
      scope1,
      scope2,
    });
  });

  // Get previous year data from pre-calculated emission_results_shakambhari
  const previousQuery = `
    SELECT
      product_id,
      SUM(CAST(production_qty AS NUMERIC)) as total_production,
      SUM(CAST(net_total_co2e AS NUMERIC)) as total_emissions
    FROM emission_results_shakambhari
    WHERE company_slug = 'shakambhari'
      AND year = $1
      AND CAST(month AS INTEGER) = ANY($2)
    GROUP BY product_id
  `;

  let previousResult;
  try {
    previousResult = await pool.query(previousQuery, [prevYear, prevTimeRange.months]);
  } catch (error) {
    previousResult = { rows: [] };
  }

  // Calculate previous year intensities
  const previousMap = new Map<string, number>();
  previousResult.rows.forEach((row) => {
    const productId = row.product_id;
    const totalProduction = parseFloat(row.total_production || '0');
    const totalEmissions = parseFloat(row.total_emissions || '0');

    if (totalProduction > 0) {
      previousMap.set(productId, totalEmissions / totalProduction);
    }
  });

  // Build product emissions array
  const productEmissions: ProductEmission[] = [];

  productMap.forEach((data, productId) => {
    const intensity = data.totalProduction > 0 ? data.totalEmissions / data.totalProduction : 0;
    const scope1Intensity = data.totalProduction > 0 ? data.scope1 / data.totalProduction : 0;
    const scope2Intensity = data.totalProduction > 0 ? data.scope2 / data.totalProduction : 0;
    const previousIntensity = previousMap.get(productId) || null;

    productEmissions.push({
      productId,
      productName: data.productName,
      emissionIntensity: Number(intensity.toFixed(2)),
      directEmission: Number(scope1Intensity.toFixed(2)),
      indirectEmission: Number(scope2Intensity.toFixed(2)),
      yoyChange: calculateYoYChange(intensity, previousIntensity),
    });
  });

  // Sort by emission intensity descending
  productEmissions.sort((a, b) => b.emissionIntensity - a.emissionIntensity);

  return productEmissions;
}

/**
 * Get product emissions for a company
 */
export async function getProductEmissions(
  pool: Pool,
  company: string,
  year: string,
  period: TimePeriod,
  timeRange: TimeRange,
  search?: string
): Promise<ProductEmissionsResponse> {
  const isMetaEngitech = company === 'meta_engitech_pune';

  const data = isMetaEngitech
    ? await calculateProductEmissionsMetaEngitech(pool, year, period, timeRange, search)
    : await calculateProductEmissionsShakambhari(pool, year, period, timeRange, search);

  const avgIntensity =
    data.length > 0
      ? data.reduce((sum, item) => sum + item.emissionIntensity, 0) / data.length
      : 0;

  return {
    data,
    avgIntensity: Number(avgIntensity.toFixed(2)),
    totalProducts: data.length,
  };
}
