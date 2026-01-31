import { pool } from "@/lib/db";
import { calculateAll } from "./calculate";
import type { ConsumptionData } from "@/lib/parsers/consumption/types";
import type { RoutingData } from "@/lib/parsers/types";
import type { WorkCenterEmission, ProductEmission } from "./types";

/**
 * Main entry point for emission calculation.
 * Reads routing + consumption from DB, calculates, writes results back.
 *
 * Called automatically (fire-and-forget) after consumption upload,
 * or synchronously via the manual /api/emissions/calculate endpoint.
 */
export async function triggerEmissionCalculation(
  companySlug: string,
  year: number,
  month: number
): Promise<{ byProcessCount: number; byProductCount: number }> {
  // 1. Fetch routing data
  const routingResult = await pool.query(
    `SELECT data FROM routing_data WHERE company_slug = $1`,
    [companySlug]
  );
  if (routingResult.rows.length === 0) {
    console.warn(`[emissions] No routing data for ${companySlug}, skipping calculation`);
    return { byProcessCount: 0, byProductCount: 0 };
  }

  // 2. Fetch consumption data
  const consumptionResult = await pool.query(
    `SELECT data FROM consumption_data WHERE company_slug = $1 AND year = $2 AND month = $3`,
    [companySlug, year, month]
  );
  if (consumptionResult.rows.length === 0) {
    console.warn(`[emissions] No consumption data for ${companySlug} ${year}/${month}, skipping`);
    return { byProcessCount: 0, byProductCount: 0 };
  }

  // pg driver auto-parses JSONB columns into JS objects
  const routing: RoutingData = routingResult.rows[0].data;
  const consumption: ConsumptionData = consumptionResult.rows[0].data;

  // 3. Calculate
  const results = calculateAll(routing, consumption);

  // 4. Write results
  await writeByProcessResults(companySlug, year, month, results.byProcess);
  await writeByProductResults(companySlug, year, month, results.byProduct);

  console.log(
    `[emissions] Calculated for ${companySlug} ${year}/${month}: ` +
      `${results.byProcess.length} work centers, ${results.byProduct.length} products`
  );

  return {
    byProcessCount: results.byProcess.length,
    byProductCount: results.byProduct.length,
  };
}

/**
 * Batch upsert by-process emission results.
 * Typically ~20-50 rows, so a single multi-value INSERT is fine.
 */
async function writeByProcessResults(
  companySlug: string,
  year: number,
  month: number,
  emissions: WorkCenterEmission[]
): Promise<void> {
  if (emissions.length === 0) return;

  // Delete old results for this month first, then insert fresh.
  // This is simpler than ON CONFLICT for small row counts and handles
  // the case where work centers were removed from consumption data.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM emission_by_process
       WHERE company_slug = $1 AND year = $2 AND month = $3`,
      [companySlug, year, month]
    );

    // Build multi-value INSERT
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const e of emissions) {
      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
      );
      values.push(
        companySlug, year, month,
        e.workCenter, e.description, e.productionMT,
        e.electricityIntensity, e.lpgIntensity, e.dieselIntensity,
        e.totalIntensity, e.scope1Intensity, e.scope2Intensity
      );
    }

    await client.query(
      `INSERT INTO emission_by_process
        (company_slug, year, month, work_center, description, production_mt,
         electricity_intensity, lpg_intensity, diesel_intensity,
         total_intensity, scope1_intensity, scope2_intensity)
       VALUES ${placeholders.join(", ")}`,
      values
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Batch upsert by-product emission results.
 * Can be 5,000-10,000 rows. Uses unnest() for efficient single-query insert.
 */
async function writeByProductResults(
  companySlug: string,
  year: number,
  month: number,
  emissions: ProductEmission[]
): Promise<void> {
  if (emissions.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete old results for this month
    await client.query(
      `DELETE FROM emission_by_product
       WHERE company_slug = $1 AND year = $2 AND month = $3`,
      [companySlug, year, month]
    );

    // Build arrays for unnest — one array per column
    const companySlugs: string[] = [];
    const years: number[] = [];
    const months: number[] = [];
    const productIds: string[] = [];
    const wcCounts: number[] = [];
    const matchedCounts: number[] = [];
    const elecIntensities: number[] = [];
    const lpgIntensities: number[] = [];
    const dieselIntensities: number[] = [];
    const totalIntensities: number[] = [];
    const scope1s: number[] = [];
    const scope2s: number[] = [];

    for (const e of emissions) {
      companySlugs.push(companySlug);
      years.push(year);
      months.push(month);
      productIds.push(e.productId);
      wcCounts.push(e.workCenterCount);
      matchedCounts.push(e.matchedWorkCenterCount);
      elecIntensities.push(e.electricityIntensity);
      lpgIntensities.push(e.lpgIntensity);
      dieselIntensities.push(e.dieselIntensity);
      totalIntensities.push(e.totalIntensity);
      scope1s.push(e.scope1Intensity);
      scope2s.push(e.scope2Intensity);
    }

    await client.query(
      `INSERT INTO emission_by_product
        (company_slug, year, month, product_id, work_center_count,
         matched_work_center_count, electricity_intensity, lpg_intensity,
         diesel_intensity, total_intensity, scope1_intensity, scope2_intensity)
       SELECT * FROM unnest(
         $1::text[], $2::int[], $3::int[], $4::text[], $5::int[],
         $6::int[], $7::numeric[], $8::numeric[],
         $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[]
       )`,
      [
        companySlugs, years, months, productIds, wcCounts,
        matchedCounts, elecIntensities, lpgIntensities,
        dieselIntensities, totalIntensities, scope1s, scope2s,
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
