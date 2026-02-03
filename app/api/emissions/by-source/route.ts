import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany, parseTimeRange, TimePeriod } from '@/lib/analytics/utils';
import { getSourceEmissionsWithYoY } from '@/lib/analytics/by-source';

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
    const { isValid } = validateCompany(company);
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

    // Parse time period
    const timePeriod = period || 'FULL_YEAR';
    const timeRange = parseTimeRange(timePeriod);

    // Get emissions with YoY/QoQ comparison
    const data = await getSourceEmissionsWithYoY(
      pool,
      company!,
      year,
      timePeriod,
      timeRange
    );

    // Check if there's any data
    const hasData = data.current.materialsAndFuels > 0 || data.current.energy > 0;

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
    console.error('Error fetching source emissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source emissions' },
      { status: 500 }
    );
  }
}
