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
import { loadMetaEngitechConstants, loadShakambhariConstants } from "@/lib/emissions/constants-loader";
import type { ShakambhariProductStreams, AggregatedSourceStream, ShakambhariProductDProcesses } from "./types";

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

/** Normalize a string for case+space-insensitive comparison. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
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
  materialIds: string[],
  cnCodes: Record<string, string> = {}
): Promise<ReportResult> {
  const startStr = formatDateCompact(startDate);
  const endStr = formatDateCompact(endDate);
  console.log(
    `[reports] Starting generation: ${companySlug}, ${startStr} → ${endStr}`
  );

  // 1. Load the template workbook (company-specific template)
  const workbook = await loadTemplate(companySlug);
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
    cnCodes,
  };

  // 2b. Load DB data needed by fillers
  if (companySlug === "meta_engitech_pune") {
    await loadMetaEngitechData(ctx);
    await loadDProcessesData(ctx);
  } else if (companySlug === "shakambhari") {
    await loadShakambhariData(ctx);
    await loadShakambhariDProcessesData(ctx);
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

  // 4. Force Excel to recalculate all formulas on open.
  //    ExcelJS preserves cached formula results from the template. Since we
  //    cleared data cells, the cached results are stale (e.g. "Silico Manganese"
  //    still appears in formula cells that reference now-empty source cells).
  //    Setting calcProperties.fullCalcOnLoad makes Excel recalculate everything
  //    when the file is opened, so users never see stale cached values.
  workbook.calcProperties = { fullCalcOnLoad: true };

  // 5. Serialize the modified workbook to a Buffer
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(rawBuffer);

  // Include material ID in filename when generating for a single material
  const materialSuffix =
    materialIds.length === 1 ? `_${materialIds[0]}` : "";
  const fileName = `CBAM_Report_${companySlug}_${startStr}_to_${endStr}${materialSuffix}.xlsx`;

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

/**
 * Load Shakambhari DB data into the report context.
 *
 * Data source: emission_results_shakambhari table.
 * Each row is one production batch with a source_breakdowns JSONB array
 * containing per-source details (compName, category, quantity, carbonContent, co2e).
 *
 * We aggregate source_breakdowns across all production records for the selected
 * products in the date range, grouping by (product_name, compName, category).
 *
 * The result is structured as ShakambhariProductStreams[] — one per product,
 * each with input streams and output streams ready for the B_EmInst filler.
 */
async function loadShakambhariData(ctx: ReportContext): Promise<void> {
  const { period, materialIds } = ctx;
  const ym = period.yearMonths;

  // 1. Load Shakambhari emission constants (carbon content map, electricity EF)
  ctx.shakambhariConstants = await loadShakambhariConstants(
    ym[0].year,
    ym[0].month
  );
  const CO2_PER_C = ctx.shakambhariConstants.co2_per_carbon; // 44/12 = 3.667
  const electricityEF = ctx.shakambhariConstants.electricity_ef; // tCO2/kWh (e.g. 0.000598)

  // 2. Query emission_results for the selected products in the date range.
  //    We need the source_breakdowns JSONB to aggregate source streams.
  //
  //    materialIds come from sales_data where they're stored as product names
  //    (e.g. "Ferro Manganese (75-80) Prime"), but emission_results stores a
  //    numeric product_id (e.g. "70000057") with the name in product_name.
  //    We match on product_name using case+space-insensitive comparison.
  const ymClause = buildYearMonthClause(ym, 2);
  const paramIdx = ymClause.nextParamIdx;

  const normalizedNames = materialIds.map((id) => normalize(id));
  const result = await pool.query(
    `SELECT product_id, product_name, source_breakdowns
     FROM emission_results_shakambhari
     WHERE company_slug = $1
       AND ${ymClause.clause}
       AND LOWER(REGEXP_REPLACE(product_name, '\\s+', '', 'g')) = ANY($${paramIdx})`,
    ["shakambhari", ...ymClause.params, normalizedNames]
  );

  // 3. Build reverse lookup: normalized product_name → original materialId.
  //    This lets us key aggregation maps by the materialId the rest of the
  //    pipeline expects (the product name string from sales_data).
  const normToMaterialId = new Map<string, string>();
  for (const id of materialIds) {
    normToMaterialId.set(normalize(id), id);
  }

  // Helper: resolve a DB row's product_name to the matching materialId
  const resolveMatId = (productName: string): string | null =>
    normToMaterialId.get(normalize(productName)) ?? null;

  // 4. Aggregate: for each materialId × compName × category, sum quantities.
  //    Also sum electricity kWh separately for indirect emissions.
  let totalElectricityKWh = 0;
  const aggMap = new Map<
    string,
    {
      materialId: string;
      compName: string;
      category: "input" | "byproduct" | "main_product";
      totalQty: number;
      carbonContent: number;
    }
  >();

  for (const row of result.rows) {
    const materialId = resolveMatId(row.product_name as string);
    if (!materialId) continue; // shouldn't happen, but guard

    const breakdowns = row.source_breakdowns as Array<{
      compName: string;
      category: string;
      quantity: number;
      carbonContent: number | null;
    }>;

    for (const src of breakdowns) {
      // Electricity is not a source stream in B_EmInst, but we need the
      // total kWh for indirect emissions (C_Emissions&Energy M26).
      if (src.category === "electricity") {
        totalElectricityKWh += src.quantity;
        continue;
      }

      const cat = src.category as "input" | "byproduct" | "main_product";
      const key = `${materialId}|${src.compName}|${cat}`;

      const existing = aggMap.get(key);
      if (existing) {
        existing.totalQty += src.quantity;
      } else {
        aggMap.set(key, {
          materialId,
          compName: src.compName,
          category: cat,
          totalQty: src.quantity,
          carbonContent: src.carbonContent ?? 0,
        });
      }
    }
  }

  // 4b. Indirect emissions: total electricity kWh × electricity EF
  ctx.quarterIndirectCO2e = totalElectricityKWh * electricityEF;

  // 5. Group into per-materialId streams
  const productMap = new Map<string, { inputs: AggregatedSourceStream[]; outputs: AggregatedSourceStream[] }>();

  for (const agg of aggMap.values()) {
    if (!productMap.has(agg.materialId)) {
      productMap.set(agg.materialId, { inputs: [], outputs: [] });
    }
    const group = productMap.get(agg.materialId)!;

    const stream: AggregatedSourceStream = {
      compName: agg.compName,
      category: agg.category,
      // Inputs are positive, outputs are negative (mass balance convention)
      totalQuantity: agg.category === "input" ? agg.totalQty : -agg.totalQty,
      carbonContent: agg.carbonContent,
      emissionFactor: agg.carbonContent * CO2_PER_C, // tCO2/t
    };

    if (agg.category === "input") {
      group.inputs.push(stream);
    } else {
      group.outputs.push(stream);
    }
  }

  // 6. Build final array in materialIds order, with short labels for the sheet
  ctx.shakambhariSourceStreams = materialIds
    .filter((id) => productMap.has(id))
    .map((id) => {
      const group = productMap.get(id)!;
      // Short label: "Ferro Manganese (70-75) Prime" → "FeMn" or "SiMn"
      const shortLabel = id.includes("Ferro") ? "FeMn" : id.includes("Silico") ? "SiMn" : id;
      return {
        productName: shortLabel,
        inputs: group.inputs,
        outputs: group.outputs,
      } satisfies ShakambhariProductStreams;
    });

  console.log(
    `[reports] Shakambhari data loaded: ` +
      `${result.rows.length} emission records, ` +
      `${ctx.shakambhariSourceStreams.length} product(s) with source streams, ` +
      `indirect=${ctx.quarterIndirectCO2e?.toFixed(4)} tCO2e ` +
      `(${totalElectricityKWh.toFixed(0)} kWh × ${electricityEF} tCO2/kWh)`
  );
}

/**
 * Load Shakambhari D_Processes data: per-product sales, scope1 intensity, and
 * electricity consumption for each selected material.
 *
 * For each product:
 *   1. quantity sold = SUM(quantity_mt) from sales_data for this customer + material + period
 *   2. scope1 intensity = SUM(net_scope1_co2e) / SUM(production_qty) from emission_results
 *   3. electricity per tonne = SUM(electricity kWh from source_breakdowns) / SUM(production_qty)
 *   4. directEmissions = scope1_intensity × quantitySold
 *   5. electricityMWh = (elecKwhPerTonne × quantitySold) / 1000
 *   6. electricityEF = from constants (tCO2/kWh × 1000 → tCO2/MWh)
 */
async function loadShakambhariDProcessesData(ctx: ReportContext): Promise<void> {
  const { period, customerCode, materialIds } = ctx;
  const ym = period.yearMonths;

  // Electricity EF: stored as tCO2/kWh, convert to tCO2/MWh for the report
  const electricityEFMWh = (ctx.shakambhariConstants?.electricity_ef ?? 0) * 1000;

  // 1. Sales: quantity sold per material for this customer in the period
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
    ["shakambhari", ...salesYM.params, customerCode, materialIds]
  );

  const salesMap = new Map<string, number>();
  for (const row of salesResult.rows) {
    salesMap.set(row.material_id, Number(row.total_qty) || 0);
  }

  // 2. Emission results: per-product scope1 intensity and electricity kWh/tonne
  //    We query emission_results_shakambhari for the same period (all products, not
  //    just the customer's — intensity is installation-wide, not customer-specific).
  //    Match on product_name (case+space-insensitive) since materialIds are product names.
  const emYM = buildYearMonthClause(ym, 2);
  paramIdx = emYM.nextParamIdx;
  const normalizedNames = materialIds.map((id) => normalize(id));
  // Query emission results with electricity kWh extracted directly from
  // source_breakdowns (category='electricity') instead of back-calculating
  // from electricity_co2e — because when electricity_ef is 0, the co2e is
  // also 0 and back-calculation gives 0 kWh even though consumption exists.
  const emResult = await pool.query(
    `SELECT product_name,
            SUM(production_qty) as total_production,
            SUM(net_scope1_co2e) as total_scope1,
            SUM(
              (SELECT COALESCE(SUM((elem->>'quantity')::numeric), 0)
               FROM jsonb_array_elements(source_breakdowns) AS elem
               WHERE elem->>'category' = 'electricity')
            ) as total_elec_kwh
     FROM emission_results_shakambhari
     WHERE company_slug = $1
       AND ${emYM.clause}
       AND LOWER(REGEXP_REPLACE(product_name, '\\s+', '', 'g')) = ANY($${paramIdx})
     GROUP BY product_name`,
    ["shakambhari", ...emYM.params, normalizedNames]
  );

  // Build reverse lookup: normalized product_name → original materialId
  const normToMaterialId = new Map<string, string>();
  for (const id of materialIds) {
    normToMaterialId.set(normalize(id), id);
  }

  // Build intensity lookup: materialId → { scope1PerTonne, elecKwhPerTonne }
  const intensityMap = new Map<string, { scope1PerTonne: number; elecKwhPerTonne: number }>();

  for (const row of emResult.rows) {
    const totalProd = Number(row.total_production) || 0;
    if (totalProd === 0) continue;

    const scope1PerTonne = (Number(row.total_scope1) || 0) / totalProd;
    const elecKwhPerTonne = (Number(row.total_elec_kwh) || 0) / totalProd;

    // Key by the original materialId, not the DB's product_name
    const materialId = normToMaterialId.get(normalize(row.product_name as string));
    if (materialId) {
      intensityMap.set(materialId, { scope1PerTonne, elecKwhPerTonne });
    }
  }

  // 3. Build per-product D_Processes data
  ctx.shakambhariDProcesses = materialIds.map((materialId) => {
    const qtySold = salesMap.get(materialId) ?? 0;
    const intensity = intensityMap.get(materialId);
    const scope1PerTonne = intensity?.scope1PerTonne ?? 0;
    const elecKwhPerTonne = intensity?.elecKwhPerTonne ?? 0;

    return {
      materialId,
      quantitySoldMT: qtySold,
      directEmissionsCO2e: scope1PerTonne * qtySold,
      electricityMWh: (elecKwhPerTonne * qtySold) / 1000,
      electricityEF: electricityEFMWh,
    } satisfies ShakambhariProductDProcesses;
  });

  console.log(
    `[reports] Shakambhari D_Processes loaded: ` +
      `${ctx.shakambhariDProcesses.length} product(s), ` +
      ctx.shakambhariDProcesses
        .map((p) => `${p.materialId}: ${p.quantitySoldMT}t sold, ${p.directEmissionsCO2e.toFixed(2)} tCO2e direct, ${p.electricityMWh.toFixed(2)} MWh`)
        .join("; ")
  );
}
