import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";

// GET /api/emissions/summary?companySlug=X&year=Y&month=M
//
// Returns aggregated emission summary for a given month:
// - Total scope 1 & scope 2 intensities (summed across work centers)
// - Work center and product counts
// - Highest/lowest emitting products

export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    if (!companySlug || !year || !month) {
      return NextResponse.json(
        { error: "companySlug, year, and month are required" },
        { status: 400 }
      );
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    // Run both queries in parallel
    const [processResult, productResult] = await Promise.all([
      // By-process summary: aggregate across all work centers
      pool.query(
        `SELECT
          COUNT(*) AS "workCenterCount",
          SUM(electricity_intensity) AS "totalElectricityIntensity",
          SUM(lpg_intensity) AS "totalLpgIntensity",
          SUM(diesel_intensity) AS "totalDieselIntensity",
          SUM(total_intensity) AS "totalIntensity",
          SUM(scope1_intensity) AS "totalScope1Intensity",
          SUM(scope2_intensity) AS "totalScope2Intensity",
          SUM(production_mt) AS "totalProductionMT"
         FROM emission_by_process_meta_engitech
         WHERE company_slug = $1 AND year = $2 AND month = $3`,
        [companySlug, yearNum, monthNum]
      ),
      // By-product summary: count + min/max/avg
      pool.query(
        `SELECT
          COUNT(*) AS "productCount",
          AVG(total_intensity) AS "avgProductIntensity",
          MAX(total_intensity) AS "maxProductIntensity",
          MIN(total_intensity) AS "minProductIntensity"
         FROM emission_by_product_meta_engitech
         WHERE company_slug = $1 AND year = $2 AND month = $3`,
        [companySlug, yearNum, monthNum]
      ),
    ]);

    const process = processResult.rows[0];
    const product = productResult.rows[0];

    return NextResponse.json({
      byProcess: {
        workCenterCount: parseInt(process.workCenterCount),
        totalElectricityIntensity: parseFloat(process.totalElectricityIntensity) || 0,
        totalLpgIntensity: parseFloat(process.totalLpgIntensity) || 0,
        totalDieselIntensity: parseFloat(process.totalDieselIntensity) || 0,
        totalIntensity: parseFloat(process.totalIntensity) || 0,
        totalScope1Intensity: parseFloat(process.totalScope1Intensity) || 0,
        totalScope2Intensity: parseFloat(process.totalScope2Intensity) || 0,
        totalProductionMT: parseFloat(process.totalProductionMT) || 0,
      },
      byProduct: {
        productCount: parseInt(product.productCount),
        avgProductIntensity: parseFloat(product.avgProductIntensity) || 0,
        maxProductIntensity: parseFloat(product.maxProductIntensity) || 0,
        minProductIntensity: parseFloat(product.minProductIntensity) || 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch emission summary:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
