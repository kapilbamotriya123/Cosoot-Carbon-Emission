import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { validateCompany, parseTimeRange, TimePeriod } from '@/lib/analytics/utils';
import { getProductEmissions } from '@/lib/analytics/by-product';

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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

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

    const result = await getProductEmissions(pool, company!, year, timePeriod, timeRange);

    // Pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = result.data.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      data: paginatedData,
      avgIntensity: result.avgIntensity,
      totalProducts: result.totalProducts,
      hasData: result.data.length > 0,
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(result.data.length / pageSize),
        totalItems: result.data.length,
      },
      meta: {
        company,
        year,
        period: timePeriod,
        timeRange: { months: timeRange.months },
      },
    });
  } catch (error) {
    console.error('Error fetching product emissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product emissions' },
      { status: 500 }
    );
  }
}
