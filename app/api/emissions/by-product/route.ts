import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";

// GET /api/emissions/by-product?companySlug=X&year=Y&month=M&page=1&pageSize=50
//
// Returns paginated product emission intensities for a given month.
// Sorted by total_intensity DESC by default (highest emitters first).

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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50")));

    if (!companySlug || !year || !month) {
      return NextResponse.json(
        { error: "companySlug, year, and month are required" },
        { status: 400 }
      );
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const offset = (page - 1) * pageSize;

    // Get total count and paginated results in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM emission_by_product
         WHERE company_slug = $1 AND year = $2 AND month = $3`,
        [companySlug, yearNum, monthNum]
      ),
      pool.query(
        `SELECT
          product_id AS "productId",
          work_center_count AS "workCenterCount",
          matched_work_center_count AS "matchedWorkCenterCount",
          electricity_intensity AS "electricityIntensity",
          lpg_intensity AS "lpgIntensity",
          diesel_intensity AS "dieselIntensity",
          total_intensity AS "totalIntensity",
          scope1_intensity AS "scope1Intensity",
          scope2_intensity AS "scope2Intensity",
          calculated_at AS "calculatedAt"
         FROM emission_by_product
         WHERE company_slug = $1 AND year = $2 AND month = $3
         ORDER BY total_intensity DESC
         LIMIT $4 OFFSET $5`,
        [companySlug, yearNum, monthNum, pageSize, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return NextResponse.json({
      products: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Failed to fetch by-product emissions:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
