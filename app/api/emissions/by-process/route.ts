import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";

// GET /api/emissions/by-process?companySlug=X&year=Y&month=M
//
// Returns emission intensities for each work center in a given month.
// No pagination needed — typically 20-50 work centers.

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const result = await pool.query(
      `SELECT
        work_center AS "workCenter",
        description,
        production_mt AS "productionMT",
        electricity_intensity AS "electricityIntensity",
        lpg_intensity AS "lpgIntensity",
        diesel_intensity AS "dieselIntensity",
        total_intensity AS "totalIntensity",
        scope1_intensity AS "scope1Intensity",
        scope2_intensity AS "scope2Intensity",
        calculated_at AS "calculatedAt"
       FROM emission_by_process
       WHERE company_slug = $1 AND year = $2 AND month = $3
       ORDER BY total_intensity DESC`,
      [companySlug, parseInt(year), parseInt(month)]
    );

    return NextResponse.json({
      workCenters: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Failed to fetch by-process emissions:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
