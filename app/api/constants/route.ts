import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { getDefaultConstants } from "@/lib/emissions/constants-loader";
import { validateCompany } from "@/lib/analytics/utils";

/**
 * GET /api/constants?company=X&year=Y&quarter=Q
 *
 * Fetch emission constants for a company and quarter.
 * Falls back to most recent previous quarter, then to hardcoded defaults.
 */
export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    const { searchParams } = request.nextUrl;
    const company = searchParams.get("company");
    const yearStr = searchParams.get("year");
    const quarterStr = searchParams.get("quarter");

    if (!company || !yearStr || !quarterStr) {
      return NextResponse.json(
        { error: "Missing required params: company, year, quarter" },
        { status: 400 }
      );
    }

    const { isValid } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    const quarter = parseInt(quarterStr, 10);

    if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: "Invalid year or quarter (1-4)" },
        { status: 400 }
      );
    }

    // Try exact match first
    const exactResult = await pool.query(
      `SELECT constants, year, quarter FROM emission_constants
       WHERE company_slug = $1 AND year = $2 AND quarter = $3`,
      [company, year, quarter]
    );

    if (exactResult.rows.length > 0) {
      const row = exactResult.rows[0];
      return NextResponse.json({
        constants: row.constants,
        year: row.year,
        quarter: row.quarter,
        isFallback: false,
        source: "db",
      });
    }

    // Try most recent previous quarter
    const fallbackResult = await pool.query(
      `SELECT constants, year, quarter FROM emission_constants
       WHERE company_slug = $1
         AND (year < $2 OR (year = $2 AND quarter < $3))
       ORDER BY year DESC, quarter DESC
       LIMIT 1`,
      [company, year, quarter]
    );

    if (fallbackResult.rows.length > 0) {
      const row = fallbackResult.rows[0];
      return NextResponse.json({
        constants: row.constants,
        year: row.year,
        quarter: row.quarter,
        isFallback: true,
        source: "db",
        fallbackNote: `Using Q${row.quarter} ${row.year} constants (no entry for Q${quarter} ${year})`,
      });
    }

    // Fall back to hardcoded defaults
    return NextResponse.json({
      constants: getDefaultConstants(company),
      year,
      quarter,
      isFallback: true,
      source: "hardcoded",
      fallbackNote: "Using default values (no constants in database yet)",
    });
  } catch (error) {
    console.error("Error fetching constants:", error);
    return NextResponse.json(
      { error: "Failed to fetch constants" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/constants
 *
 * Create or update emission constants for a company and quarter.
 * Body: { company, year, quarter, constants }
 */
export async function PUT(request: NextRequest) {
  try {
    await initializeSchema();

    const body = await request.json();
    const { company, year, quarter, constants } = body;

    if (!company || !year || !quarter || !constants) {
      return NextResponse.json(
        { error: "Missing required fields: company, year, quarter, constants" },
        { status: 400 }
      );
    }

    const { isValid } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    }

    if (quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: "Quarter must be 1-4" },
        { status: 400 }
      );
    }

    await pool.query(
      `INSERT INTO emission_constants (company_slug, year, quarter, constants, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (company_slug, year, quarter)
       DO UPDATE SET constants = $4, updated_at = NOW()`,
      [company, year, quarter, JSON.stringify(constants)]
    );

    return NextResponse.json({
      success: true,
      message: `Constants saved for Q${quarter} ${year}`,
    });
  } catch (error) {
    console.error("Error saving constants:", error);
    return NextResponse.json(
      { error: "Failed to save constants" },
      { status: 500 }
    );
  }
}
