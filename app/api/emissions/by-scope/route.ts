import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany, parseTimeRange, TimePeriod } from '@/lib/analytics/utils';
import { getScopeEmissionsWithYoY } from '@/lib/analytics/by-scope';

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

    // Validate company
    const { isValid, isMetaEngitech, isShakambhari } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid company parameter' },
        { status: 400 }
      );
    }

    // Validate year
    if (!year || !/^\d{4}$/.test(year)) {
      return NextResponse.json(
        { error: 'Invalid year parameter. Expected format: YYYY' },
        { status: 400 }
      );
    }

    // Parse time period (default to FULL_YEAR if not provided)
    const timePeriod = period || 'FULL_YEAR';
    const timeRange = parseTimeRange(timePeriod);

    // Get emissions with YoY/QoQ comparison
    const data = await getScopeEmissionsWithYoY(
      pool,
      company!,
      year,
      timePeriod,
      timeRange
    );

    // Check if there's any data
    const hasData = data.current.scope1 > 0 || data.current.scope2 > 0;

    return NextResponse.json({
      success: true,
      data,
      hasData,
      meta: {
        company,
        year,
        period: timePeriod,
        timeRange: {
          months: timeRange.months,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching scope emissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scope emissions' },
      { status: 500 }
    );
  }
}
