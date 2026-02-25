import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany } from '@/lib/analytics/utils';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

function monthToQuarter(month: number): string {
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const company = searchParams.get('company');

    const { isValid, isMetaEngitech } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid company parameter' },
        { status: 400 }
      );
    }

    // Query distinct year/month combinations from the appropriate table
    const query = isMetaEngitech
      ? `SELECT DISTINCT year, month FROM emission_by_process_meta_engitech WHERE company_slug = $1 ORDER BY year DESC, month DESC`
      : `SELECT DISTINCT year, month FROM emission_results_shakambhari WHERE company_slug = $1 ORDER BY year DESC, month DESC`;

    const result = await pool.query(query, [company]);

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

    // Build sorted output (latest year first, quarters in reverse order within each year)
    const quarterOrder = ['Q4', 'Q3', 'Q2', 'Q1'];
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
  } catch (error) {
    console.error('Error fetching available periods:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available periods' },
      { status: 500 }
    );
  }
}
