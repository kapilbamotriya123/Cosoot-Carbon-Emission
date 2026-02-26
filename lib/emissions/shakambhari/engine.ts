import { pool } from "@/lib/db";
import { calculateAll } from "./calculate";
import { loadShakambhariConstants } from "../constants-loader";
import type { ProductionRecord } from "@/lib/parsers/production/types";
import type { ProductEmissionResult } from "./types";

/**
 * Main entry point for Shakambhari emission calculation.
 * Reads production data from DB, calculates emissions, writes results back.
 *
 * Calculates for an entire month at once (same pattern as Meta Engitech).
 * Re-running recalculates from scratch (delete old results, insert fresh).
 */
export async function triggerShakambhariEmissionCalculation(
  companySlug: string,
  year: number,
  month: number
): Promise<{ resultCount: number; warnings: string[] }> {
  // 1. Fetch production data for this month
  const productionResult = await pool.query(
    `SELECT date, year, month, work_center, product_id, product_name,
            order_no, production_version, production_qty, production_uom,
            plant, sources
     FROM production_data_shakambhari
     WHERE company_slug = $1 AND year = $2 AND month = $3`,
    [companySlug, year, month]
  );

  if (productionResult.rows.length === 0) {
    console.warn(
      `[shakambhari-emissions] No production data for ${companySlug} ${year}/${month}, skipping`
    );
    return { resultCount: 0, warnings: [] };
  }

  // 2. Map DB rows → ProductionRecord[]
  //    pg driver auto-parses JSONB columns, but dates come as Date objects
  const records: ProductionRecord[] = productionResult.rows.map((row) => ({
    date:
      row.date instanceof Date
        ? row.date.toISOString().split("T")[0]
        : String(row.date).split("T")[0],
    year: Number(row.year),
    month: Number(row.month),
    plant: row.plant ?? "",
    productId: row.product_id,
    productName: row.product_name ?? "",
    orderNo: row.order_no,
    productionVersion: row.production_version ?? "",
    workCenter: row.work_center,
    productionQty: parseFloat(row.production_qty) || 0,
    productionUom: row.production_uom ?? "TO",
    sources:
      typeof row.sources === "string"
        ? JSON.parse(row.sources)
        : row.sources ?? [],
  }));

  // 3. Load constants from DB (falls back to hardcoded defaults)
  const constants = await loadShakambhariConstants(year, month);

  // 4. Calculate
  const { results, warnings } = calculateAll(records, constants);

  // 5. Write results
  await writeEmissionResults(companySlug, year, month, results);

  console.log(
    `[shakambhari-emissions] Calculated for ${companySlug} ${year}/${month}: ` +
      `${results.length} records, ${warnings.length} warnings`
  );

  return { resultCount: results.length, warnings };
}

/**
 * Batch write emission results using unnest() for efficient single-query insert.
 * Delete-then-insert for the target month (same pattern as Meta Engitech engine).
 */
async function writeEmissionResults(
  companySlug: string,
  year: number,
  month: number,
  results: ProductEmissionResult[]
): Promise<void> {
  if (results.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete old results for this month
    await client.query(
      `DELETE FROM emission_results_shakambhari
       WHERE company_slug = $1 AND year = $2 AND month = $3`,
      [companySlug, year, month]
    );

    // Build parallel arrays for unnest — one array per column
    const companySlugs: string[] = [];
    const dates: string[] = [];
    const years: number[] = [];
    const months: number[] = [];
    const workCenters: string[] = [];
    const productIds: string[] = [];
    const productNames: string[] = [];
    const orderNos: string[] = [];
    const productionQtys: number[] = [];
    const productionUoms: string[] = [];
    const totalInputs: number[] = [];
    const totalOutputs: number[] = [];
    const electricities: number[] = [];
    const netScope1s: number[] = [];
    const netTotals: number[] = [];
    const breakdowns: string[] = [];

    for (const r of results) {
      companySlugs.push(companySlug);
      dates.push(r.date);
      years.push(r.year);
      months.push(r.month);
      workCenters.push(r.workCenter);
      productIds.push(r.productId);
      productNames.push(r.productName);
      orderNos.push(r.orderNo);
      productionQtys.push(r.productionQty);
      productionUoms.push(r.productionUom);
      totalInputs.push(r.totalInputCO2e);
      totalOutputs.push(r.totalOutputCO2e);
      electricities.push(r.electricityCO2e);
      netScope1s.push(r.netScope1CO2e);
      netTotals.push(r.netTotalCO2e);
      breakdowns.push(JSON.stringify(r.sourceBreakdowns));
    }

    await client.query(
      `INSERT INTO emission_results_shakambhari
        (company_slug, date, year, month, work_center, product_id, product_name,
         order_no, production_qty, production_uom,
         total_input_co2e, total_output_co2e, electricity_co2e,
         net_scope1_co2e, net_total_co2e, source_breakdowns)
       SELECT * FROM unnest(
         $1::text[], $2::date[], $3::int[], $4::int[], $5::text[], $6::text[], $7::text[],
         $8::text[], $9::numeric[], $10::text[],
         $11::numeric[], $12::numeric[], $13::numeric[],
         $14::numeric[], $15::numeric[], $16::jsonb[]
       )`,
      [
        companySlugs,
        dates,
        years,
        months,
        workCenters,
        productIds,
        productNames,
        orderNos,
        productionQtys,
        productionUoms,
        totalInputs,
        totalOutputs,
        electricities,
        netScope1s,
        netTotals,
        breakdowns,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
