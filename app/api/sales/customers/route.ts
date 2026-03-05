import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { COMPANIES } from "@/lib/constants";
import type { CompanySlug } from "@/lib/constants";

// GET /api/sales/customers?company={slug}&year={year}&quarter={Q1|Q2|Q3|Q4}
// Returns distinct customer codes from sales_data, optionally filtered by period.
export async function GET(request: NextRequest) {
  const company = request.nextUrl.searchParams.get("company");
  const year = request.nextUrl.searchParams.get("year");
  const quarter = request.nextUrl.searchParams.get("quarter");

  if (!company) {
    return NextResponse.json({ error: "company param is required" }, { status: 400 });
  }

  const validSlugs = COMPANIES.map((c) => c.slug);
  if (!validSlugs.includes(company as CompanySlug)) {
    return NextResponse.json({ error: "Invalid company slug" }, { status: 400 });
  }

  let query = `SELECT DISTINCT customer_code FROM sales_data WHERE company_slug = $1`;
  const params: (string | number)[] = [company];

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

  query += ` ORDER BY customer_code`;

  const result = await pool.query(query, params);

  return NextResponse.json({
    success: true,
    data: result.rows.map((r) => r.customer_code),
  });
}
