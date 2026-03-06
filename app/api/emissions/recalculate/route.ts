import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { triggerEmissionCalculation } from "@/lib/emissions/engine";
import { triggerShakambhariEmissionCalculation } from "@/lib/emissions/shakambhari/engine";
import { validateCompany, parseTimeRange } from "@/lib/analytics/utils";

/**
 * POST /api/emissions/recalculate
 *
 * Re-trigger emission calculations after constants are updated.
 * Only recalculates months that have existing emission/consumption data.
 *
 * Body:
 *   - company: company slug
 *   - year: the year of the uploaded constants
 *   - quarter: the quarter of the uploaded constants (1-4)
 *   - scope: "quarter" (just this quarter) or "forward" (this quarter through today)
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    await initializeSchema();

    const body = await request.json();
    const { company, year, quarter, scope } = body;

    if (!company || !year || !quarter || !scope) {
      return NextResponse.json(
        { error: "company, year, quarter, and scope are required" },
        { status: 400 }
      );
    }

    const { isValid, isMetaEngitech } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    }

    // Build the list of year/month pairs to recalculate
    const monthsToRecalc = await getMonthsToRecalculate(
      company,
      isMetaEngitech,
      year,
      quarter,
      scope
    );

    if (monthsToRecalc.length === 0) {
      return NextResponse.json({
        message: "No months with data to recalculate",
        recalculated: 0,
      });
    }

    // Run calculations sequentially (each is already optimized internally)
    let recalculated = 0;
    for (const { y, m } of monthsToRecalc) {
      if (isMetaEngitech) {
        await triggerEmissionCalculation(company, y, m);
      } else {
        await triggerShakambhariEmissionCalculation(company, y, m);
      }
      recalculated++;
    }

    return NextResponse.json({
      message: `Recalculated emissions for ${recalculated} month(s)`,
      recalculated,
      months: monthsToRecalc.map(({ y, m }) => `${m}/${y}`),
    });
  } catch (error) {
    console.error("Emission recalculation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Find which months actually have data and need recalculation.
 *
 * For Meta Engitech: check consumption_data (the source for calculations)
 * For Shakambhari: check production_data_shakambhari
 *
 * "quarter" scope: only months in the specified quarter
 * "forward" scope: from the start of the quarter through the latest month with data
 */
async function getMonthsToRecalculate(
  company: string,
  isMetaEngitech: boolean,
  year: number,
  quarter: number,
  scope: "quarter" | "forward"
): Promise<{ y: number; m: number }[]> {
  const quarterMonths = parseTimeRange(`Q${quarter}` as "Q1" | "Q2" | "Q3" | "Q4");
  const startMonth = quarterMonths.startMonth;

  const table = isMetaEngitech ? "consumption_data" : "production_data_shakambhari";

  let query: string;
  let params: unknown[];

  if (scope === "quarter") {
    // Only months in this specific quarter
    query = `
      SELECT DISTINCT year, month FROM ${table}
      WHERE company_slug = $1
        AND year = $2
        AND month = ANY($3::int[])
      ORDER BY year, month
    `;
    params = [company, year, quarterMonths.months];
  } else {
    // From the start of this quarter through the latest available data
    query = `
      SELECT DISTINCT year, month FROM ${table}
      WHERE company_slug = $1
        AND (year > $2 OR (year = $2 AND month >= $3))
      ORDER BY year, month
    `;
    params = [company, year, startMonth];
  }

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    y: Number(row.year),
    m: Number(row.month),
  }));
}
