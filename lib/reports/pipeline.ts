/**
 * Report generation pipeline.
 *
 * The pipeline is responsible for:
 *   1. Loading the Excel template (19-sheet EU CBAM format)
 *   2. Building the ReportContext (company profile, reporting period, DB data)
 *   3. Running each registered SheetFiller sequentially
 *   4. Returning the filled workbook as a Buffer
 *
 * FAIL-FAST: If any filler throws, the pipeline throws immediately.
 * The caller (the API route) handles the error — no partial reports are
 * ever returned to the user.
 *
 * Why sequential? Excel cross-sheet formulas mean later sheets depend on
 * data written by earlier sheets. Parallel execution would also add
 * complexity for negligible gain — we're writing ~100 cells total.
 */

import type { CompanySlug } from "@/lib/constants";
import type { ReportContext, ReportingPeriod, ReportResult } from "./types";
import { loadTemplate } from "./template";
import { getCompanyProfile } from "./company-data";
import { FILLER_REGISTRY } from "./fillers";
import { pool } from "@/lib/db";
import { loadMetaEngitechConstants } from "@/lib/emissions/constants-loader";

/**
 * Build a ReportingPeriod from arbitrary start/end dates.
 *
 * Derives the list of (year, month) tuples that fall within the range,
 * including partial months at both ends. For example:
 *   2024-11-15 → 2025-02-10 yields [{2024,11},{2024,12},{2025,1},{2025,2}]
 */
function buildPeriod(startDate: Date, endDate: Date): ReportingPeriod {
  const yearMonths: Array<{ year: number; month: number }> = [];

  let y = startDate.getFullYear();
  let m = startDate.getMonth() + 1; // 1-based

  const endY = endDate.getFullYear();
  const endM = endDate.getMonth() + 1;

  while (y < endY || (y === endY && m <= endM)) {
    yearMonths.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return { startDate, endDate, yearMonths };
}

/**
 * Build a SQL condition for (year, month) IN (...) from yearMonths array.
 *
 * Returns { clause: string, params: any[], nextParamIdx: number }
 * Example: yearClause([{2025,4},{2025,5}], 2) → {
 *   clause: "(year, month) IN (($2,$3),($4,$5))",
 *   params: [2025, 4, 2025, 5],
 *   nextParamIdx: 6
 * }
 */
function buildYearMonthClause(
  yearMonths: Array<{ year: number; month: number }>,
  startIdx: number
): { clause: string; params: (number)[]; nextParamIdx: number } {
  const pairs: string[] = [];
  const params: number[] = [];
  let idx = startIdx;

  for (const { year, month } of yearMonths) {
    pairs.push(`($${idx},$${idx + 1})`);
    params.push(year, month);
    idx += 2;
  }

  return {
    clause: `(year, month) IN (${pairs.join(",")})`,
    params,
    nextParamIdx: idx,
  };
}

/**
 * Generate a CBAM Excel report for a given company and date range.
 *
 * Returns a ReportResult containing:
 *   - buffer: the filled workbook as a Buffer (ready to upload to GCS)
 *   - fileName: the suggested file name for download
 *   - sheetsProcessed: list of sheets that were successfully filled
 *
 * Throws on any failure (including individual filler errors).
 */
export async function generateReport(
  companySlug: CompanySlug,
  startDate: Date,
  endDate: Date,
  customerCode: string,
  materialIds: string[]
): Promise<ReportResult> {
  const startStr = formatDateCompact(startDate);
  const endStr = formatDateCompact(endDate);
  console.log(
    `[reports] Starting generation: ${companySlug}, ${startStr} → ${endStr}`
  );

  // 1. Load the template workbook
  const workbook = await loadTemplate();
  console.log(
    `[reports] Template loaded: ${workbook.worksheets.length} sheets`
  );

  // 2. Build the shared context
  const companyProfile = getCompanyProfile(companySlug);
  const period = buildPeriod(startDate, endDate);

  const ctx: ReportContext = {
    workbook,
    companySlug,
    companyProfile,
    period,
    customerCode,
    materialIds,
  };

  // 2b. Load DB data needed by fillers (Meta Engitech only for now)
  if (companySlug === "meta_engitech_pune") {
    await loadMetaEngitechData(ctx);
    await loadDProcessesData(ctx);
  }

  // 3. Run fillers sequentially — fail-fast on error
  const sheetsProcessed: string[] = [];

  for (const { sheetName, filler, description } of FILLER_REGISTRY) {
    console.log(`[reports] Filling "${sheetName}": ${description}`);

    try {
      await filler(ctx);
      sheetsProcessed.push(sheetName);
      console.log(`[reports] Done: "${sheetName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[reports] ABORT — filler for "${sheetName}" failed: ${message}`
      );
    }
  }

  // 4. Serialize the modified workbook to a Buffer
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(rawBuffer);

  const fileName = `CBAM_Report_${companySlug}_${startStr}_to_${endStr}.xlsx`;

  console.log(
    `[reports] Generated: ${fileName} ` +
      `(${(buffer.length / 1024).toFixed(1)} KB, ` +
      `${sheetsProcessed.length} sheet(s) filled)`
  );

  return { buffer, fileName, sheetsProcessed };
}

/** Format a Date as YYYY-MM-DD for file names and logs. */
function formatDateCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Load Meta Engitech DB data into the report context.
 *
 * Queries consumption_data for all months in the date range, sums fuel
 * quantities across all work centers, and converts to tonnes:
 *   Diesel: litres × density (0.832 kg/L) / 1000 → tonnes
 *   LPG: kg / 1000 → tonnes
 *
 * Also loads emission constants (NCV, EF) using the first month in the range.
 */
async function loadMetaEngitechData(ctx: ReportContext): Promise<void> {
  const { period, companySlug } = ctx;
  const ym = period.yearMonths;

  // Load emission constants (NCV, EF values) for this period
  // Uses the first month in the range; the loader finds the best match.
  ctx.emissionConstants = await loadMetaEngitechConstants(
    ym[0].year,
    ym[0].month
  );

  // Query consumption_data for all months in the date range
  const ymClause = buildYearMonthClause(ym, 2);
  const result = await pool.query(
    `SELECT data FROM consumption_data
     WHERE company_slug = $1 AND ${ymClause.clause}`,
    [companySlug, ...ymClause.params]
  );

  let totalDieselLtrs = 0;
  let totalLpgKg = 0;
  let totalEnergyKWh = 0;

  for (const row of result.rows) {
    const data = row.data as Record<
      string,
      {
        dieselConsumptionLtrs?: number | null;
        lpgConsumptionKg?: number | null;
        totalEnergyKWh?: number | null;
      }
    >;
    for (const wc of Object.values(data)) {
      totalDieselLtrs += wc.dieselConsumptionLtrs ?? 0;
      totalLpgKg += wc.lpgConsumptionKg ?? 0;
      totalEnergyKWh += wc.totalEnergyKWh ?? 0;
    }
  }

  // Convert to tonnes
  ctx.quarterDieselTonnes =
    (totalDieselLtrs * ctx.emissionConstants.diesel_density) / 1000;
  ctx.quarterLpgTonnes = totalLpgKg / 1000;

  // Indirect emissions: totalEnergyKWh × electricity_ef (which is tCO2/kWh)
  ctx.quarterIndirectCO2e = totalEnergyKWh * ctx.emissionConstants.electricity_ef;

  console.log(
    `[reports] Meta Engitech data loaded: ` +
      `diesel=${ctx.quarterDieselTonnes.toFixed(2)}t, ` +
      `lpg=${ctx.quarterLpgTonnes.toFixed(2)}t, ` +
      `indirect=${ctx.quarterIndirectCO2e.toFixed(2)} tCO2e ` +
      `(${result.rows.length} month(s) of consumption data)`
  );
}

/**
 * Load D_Processes data: per-product sales quantities and emission intensities.
 *
 * For each selected material sold to the customer in the date range:
 *   1. Get quantity_mt from sales_data
 *   2. Get scope1_intensity and scope2_intensity from emission_by_product_meta_engitech
 *      (averaged across the range's months)
 *   3. Compute:
 *      - totalDirectEmissionsCO2e = SUM(scope1_intensity × quantity_mt) per product
 *      - totalElectricityMWh = SUM(scope2_intensity × quantity_mt / electricity_ef_MWh) per product
 *        where electricity_ef_MWh = electricity_ef × 1000 (convert tCO2/kWh → tCO2/MWh)
 *
 * Note on electricity data source:
 *   Meta Engitech: electricity is in consumption_data JSONB as totalEnergyKWh per work center.
 *     scope2_intensity = sum of (totalEnergyKWh / productionMT * electricity_ef) across WCs.
 *     We back-calculate MWh from scope2_intensity for the report.
 *   Shakambhari: electricity is in production_data_shakambhari.sources[] as "Mix Power" (KWH).
 *     Will need a different approach when implemented.
 */
async function loadDProcessesData(ctx: ReportContext): Promise<void> {
  const { period, companySlug, customerCode, materialIds, emissionConstants } = ctx;

  if (!emissionConstants) {
    throw new Error("D_Processes requires emissionConstants — was pipeline data loading skipped?");
  }

  // electricity_ef is stored as tCO2/kWh (e.g. 0.000598). Convert to tCO2/MWh (0.598).
  const electricityEFMWh = emissionConstants.electricity_ef * 1000;
  const ym = period.yearMonths;

  // 1. Get total quantity sold to this customer for selected materials in the date range
  const salesYM = buildYearMonthClause(ym, 2);
  let paramIdx = salesYM.nextParamIdx;
  const salesResult = await pool.query(
    `SELECT material_id, SUM(quantity_mt) as total_qty
     FROM sales_data
     WHERE company_slug = $1
       AND ${salesYM.clause}
       AND customer_code = $${paramIdx}
       AND material_id = ANY($${paramIdx + 1})
     GROUP BY material_id`,
    [companySlug, ...salesYM.params, customerCode, materialIds]
  );

  // 2. Get average emission intensities for these materials across the range's months
  const emYM = buildYearMonthClause(ym, 2);
  paramIdx = emYM.nextParamIdx;
  const emissionResult = await pool.query(
    `SELECT product_id,
            AVG(scope1_intensity) as avg_scope1,
            AVG(scope2_intensity) as avg_scope2
     FROM emission_by_product_meta_engitech
     WHERE company_slug = $1
       AND ${emYM.clause}
       AND product_id = ANY($${paramIdx})
     GROUP BY product_id`,
    [companySlug, ...emYM.params, materialIds]
  );

  // Build emission lookup: materialId → { scope1, scope2 }
  const emissionMap = new Map<string, { scope1: number; scope2: number }>();
  for (const row of emissionResult.rows) {
    emissionMap.set(row.product_id, {
      scope1: Number(row.avg_scope1) || 0,
      scope2: Number(row.avg_scope2) || 0,
    });
  }

  // 3. Aggregate across all selected materials
  let totalQuantityMT = 0;
  let totalDirectEmissionsCO2e = 0;
  let totalElectricityMWh = 0;

  for (const row of salesResult.rows) {
    const qty = Number(row.total_qty) || 0;
    const materialId = row.material_id as string;
    const emissions = emissionMap.get(materialId);

    totalQuantityMT += qty;

    if (emissions) {
      // Direct emissions = scope1_intensity (tCO2/t) × quantity (t) = tCO2e
      totalDirectEmissionsCO2e += emissions.scope1 * qty;
      // Electricity MWh = scope2_intensity (tCO2/t) × quantity (t) / electricity_ef (tCO2/MWh)
      totalElectricityMWh += (emissions.scope2 * qty) / electricityEFMWh;
    }
  }

  ctx.dProcesses = {
    totalQuantityMT,
    totalDirectEmissionsCO2e,
    totalElectricityMWh,
    electricityEF: electricityEFMWh,
  };

  console.log(
    `[reports] D_Processes data loaded: ` +
      `qty=${totalQuantityMT.toFixed(2)}t, ` +
      `directCO2e=${totalDirectEmissionsCO2e.toFixed(4)}, ` +
      `elecMWh=${totalElectricityMWh.toFixed(4)} ` +
      `(customer=${customerCode}, ${materialIds.length} material(s))`
  );
}
