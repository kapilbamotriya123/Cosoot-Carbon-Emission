import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany, parseTimeRange, TimePeriod } from '@/lib/analytics/utils';
import { getProcessEmissions } from '@/lib/analytics/by-process';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const company = searchParams.get('company');
    const year = searchParams.get('year');
    const period = searchParams.get('period') as TimePeriod | null;

    const { isValid } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid company parameter' },
        { status: 400 }
      );
    }

    if (!year || !/^\d{4}$/.test(year)) {
      return NextResponse.json(
        { error: 'Invalid year parameter. Expected format: YYYY' },
        { status: 400 }
      );
    }

    const timePeriod = period || 'FULL_YEAR';
    const timeRange = parseTimeRange(timePeriod);

    const result = await getProcessEmissions(pool, company!, year, timePeriod, timeRange);

    return NextResponse.json({
      success: true,
      data: result.data,
      totalEmissions: result.totalEmissions,
      hasData: result.data.length > 0,
      meta: {
        company,
        year,
        period: timePeriod,
        timeRange: { months: timeRange.months },
      },
    });
  } catch (error) {
    console.error('Error fetching process emissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch process emissions' },
      { status: 500 }
    );
  }
}
