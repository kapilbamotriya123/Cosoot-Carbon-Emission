import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { COMPANIES } from "@/lib/constants";
import type { CompanySlug } from "@/lib/constants";

function monthToQuarter(month: number): string {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

// GET /api/sales/periods?company={slug}
// Returns available year/quarter combos from sales_data, sorted descending.
export async function GET(request: NextRequest) {
  const company = request.nextUrl.searchParams.get("company");

  if (!company) {
    return NextResponse.json({ error: "company param is required" }, { status: 400 });
  }

  const validSlugs = COMPANIES.map((c) => c.slug);
  if (!validSlugs.includes(company as CompanySlug)) {
    return NextResponse.json({ error: "Invalid company slug" }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT DISTINCT year, month FROM sales_data WHERE company_slug = $1 ORDER BY year DESC, month DESC`,
    [company]
  );

  // Group months into quarters per year
  const yearMap = new Map<number, Set<string>>();
  for (const row of result.rows) {
    const year = Number(row.year);
    const month = Number(row.month);
    const quarter = monthToQuarter(month);
    if (!yearMap.has(year)) {
      yearMap.set(year, new Set());
    }
    yearMap.get(year)!.add(quarter);
  }

  const quarterOrder = ["Q4", "Q3", "Q2", "Q1"];
  const periods = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, quarters]) => ({
      year: String(year),
      quarters: quarterOrder.filter((q) => quarters.has(q)),
    }));

  return NextResponse.json({
    success: true,
    periods,
  });
}
