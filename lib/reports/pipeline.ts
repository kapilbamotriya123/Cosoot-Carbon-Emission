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
 * Derive start/end dates and month list from a year + quarter.
 *
 * Quarter → months:
 *   Q1 → Jan, Feb, Mar  (months 1–3)
 *   Q2 → Apr, May, Jun  (months 4–6)
 *   Q3 → Jul, Aug, Sep  (months 7–9)
 *   Q4 → Oct, Nov, Dec  (months 10–12)
 */
function buildPeriod(year: number, quarter: number): ReportingPeriod {
  const startMonth = (quarter - 1) * 3 + 1; // Q1→1, Q2→4, Q3→7, Q4→10
  const endMonth = startMonth + 2;

  // new Date(year, month - 1, 1)  → first day of startMonth
  // new Date(year, endMonth, 0)   → day 0 of the month after endMonth
  //                                 = last day of endMonth
  const startDate = new Date(year, startMonth - 1, 1);
  const endDate = new Date(year, endMonth, 0); // e.g. Jun 30 for Q2

  const months = [startMonth, startMonth + 1, startMonth + 2];

  return { year, quarter, startDate, endDate, months };
}

/**
 * Generate a CBAM Excel report for a given company and quarter.
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
  year: number,
  quarter: number,
  customerCode: string,
  materialIds: string[]
): Promise<ReportResult> {
  console.log(
    `[reports] Starting generation: ${companySlug}, ${year} Q${quarter}`
  );

  // 1. Load the template workbook
  const workbook = await loadTemplate();
  console.log(
    `[reports] Template loaded: ${workbook.worksheets.length} sheets`
  );

  // 2. Build the shared context
  const companyProfile = getCompanyProfile(companySlug);
  const period = buildPeriod(year, quarter);

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

  const fileName = `CBAM_Report_${companySlug}_${year}_Q${quarter}.xlsx`;

  console.log(
    `[reports] Generated: ${fileName} ` +
      `(${(buffer.length / 1024).toFixed(1)} KB, ` +
      `${sheetsProcessed.length} sheet(s) filled)`
  );

  return { buffer, fileName, sheetsProcessed };
}

/**
 * Load Meta Engitech DB data into the report context.
 *
 * Queries consumption_data for all months in the quarter, sums fuel
 * quantities across all work centers, and converts to tonnes:
 *   Diesel: litres × density (0.832 kg/L) / 1000 → tonnes
 *   LPG: kg / 1000 → tonnes
 *
 * Also loads emission constants (NCV, EF) for the quarter.
 */
async function loadMetaEngitechData(ctx: ReportContext): Promise<void> {
  const { period, companySlug } = ctx;

  // Load emission constants (NCV, EF values) for this quarter
  // Uses the first month of the quarter; the loader finds the best match.
  ctx.emissionConstants = await loadMetaEngitechConstants(
    period.year,
    period.months[0]
  );

  // Query consumption_data JSONB for all months in the quarter
  const result = await pool.query(
    `SELECT data FROM consumption_data
     WHERE company_slug = $1 AND year = $2 AND month = ANY($3)`,
    [companySlug, period.year, period.months]
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
 * For each selected material sold to the customer in the quarter:
 *   1. Get quantity_mt from sales_data
 *   2. Get scope1_intensity and scope2_intensity from emission_by_product_meta_engitech
 *      (averaged across the quarter's months)
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

  // 1. Get total quantity sold to this customer for selected materials in the quarter
  const salesResult = await pool.query(
    `SELECT material_id, SUM(quantity_mt) as total_qty
     FROM sales_data
     WHERE company_slug = $1
       AND year = $2
       AND month = ANY($3)
       AND customer_code = $4
       AND material_id = ANY($5)
     GROUP BY material_id`,
    [companySlug, period.year, period.months, customerCode, materialIds]
  );

  // 2. Get average emission intensities for these materials across the quarter's months
  const emissionResult = await pool.query(
    `SELECT product_id,
            AVG(scope1_intensity) as avg_scope1,
            AVG(scope2_intensity) as avg_scope2
     FROM emission_by_product_meta_engitech
     WHERE company_slug = $1
       AND year = $2
       AND month = ANY($3)
       AND product_id = ANY($4)
     GROUP BY product_id`,
    [companySlug, period.year, period.months, materialIds]
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
