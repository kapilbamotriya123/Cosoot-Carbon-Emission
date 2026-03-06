import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { COMPANIES } from "@/lib/constants";
import type { CompanySlug } from "@/lib/constants";

// GET /api/sales/materials?company={slug}&customer={code}&year={year}&quarter={Q1|Q2|Q3|Q4}
// Returns distinct material IDs, optionally filtered by period.
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const company = request.nextUrl.searchParams.get("company");
  const customer = request.nextUrl.searchParams.get("customer");
  const year = request.nextUrl.searchParams.get("year");
  const quarter = request.nextUrl.searchParams.get("quarter");

  if (!company) {
    return NextResponse.json({ error: "company param is required" }, { status: 400 });
  }

  const validSlugs = COMPANIES.map((c) => c.slug);
  if (!validSlugs.includes(company as CompanySlug)) {
    return NextResponse.json({ error: "Invalid company slug" }, { status: 400 });
  }

  if (!customer) {
    return NextResponse.json({ error: "customer param is required" }, { status: 400 });
  }

  let query = `SELECT DISTINCT material_id FROM sales_data WHERE company_slug = $1 AND customer_code = $2`;
  const params: (string | number)[] = [company, customer];

  if (year) {
    params.push(Number(year));
    query += ` AND year = $${params.length}`;
  }

  if (quarter) {
    const monthRanges: Record<string, [number, number]> = {
      Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12],
    };
    const range = monthRanges[quarter];
    if (range) {
      params.push(range[0], range[1]);
      query += ` AND month >= $${params.length - 1} AND month <= $${params.length}`;
    }
  }

  query += ` ORDER BY material_id`;

  const result = await pool.query(query, params);

  return NextResponse.json({
    success: true,
    data: result.rows.map((r) => r.material_id),
  });
}
