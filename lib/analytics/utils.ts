/**
 * Shared utilities for analytics calculations
 */

export type TimePeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'FULL_YEAR';

export interface TimeRange {
  startMonth: number;
  endMonth: number;
  months: number[];
}

export interface YoYChange {
  percent: number;
  absolute: number;
}

/**
 * Parse time period into month ranges
 * @param period - Q1, Q2, Q3, Q4, or FULL_YEAR
 * @returns Object with startMonth, endMonth, and array of months
 */
export function parseTimeRange(period: TimePeriod): TimeRange {
  switch (period) {
    case 'Q1':
      return { startMonth: 1, endMonth: 3, months: [1, 2, 3] };
    case 'Q2':
      return { startMonth: 4, endMonth: 6, months: [4, 5, 6] };
    case 'Q3':
      return { startMonth: 7, endMonth: 9, months: [7, 8, 9] };
    case 'Q4':
      return { startMonth: 10, endMonth: 12, months: [10, 11, 12] };
    case 'FULL_YEAR':
      return {
        startMonth: 1,
        endMonth: 12,
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      };
    default:
      return { startMonth: 1, endMonth: 12, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  }
}

/**
 * Calculate year-over-year change
 * @param current - Current period value
 * @param previous - Previous year same period value
 * @returns Percentage change and absolute change, or null if no comparison possible
 */
export function calculateYoYChange(
  current: number,
  previous: number | null
): YoYChange | null {
  if (previous === null || previous === 0) {
    return null;
  }

  const absolute = current - previous;
  const percent = (absolute / previous) * 100;

  return {
    percent: Number(percent.toFixed(2)),
    absolute: Number(absolute.toFixed(2)),
  };
}

/**
 * Format YoY change for display
 * @param change - YoYChange object or null
 * @param unit - Unit to display (e.g., 'tCO₂e', 'tCO₂e/t')
 * @returns Formatted string like "-12% (-403 tCO₂e)" or "N/A"
 */
export function formatYoYChange(change: YoYChange | null, unit: string = 'tCO₂e'): string {
  if (!change) {
    return 'N/A';
  }

  const sign = change.absolute >= 0 ? '+' : '';
  return `${sign}${change.percent}% (${sign}${change.absolute} ${unit})`;
}

/**
 * Validate company slug
 * @param slug - Company slug from URL params
 * @returns Object with validation status and company type
 */
export function validateCompany(slug: string | null): {
  isValid: boolean;
  isMetaEngitech: boolean;
  isShakambhari: boolean;
} {
  if (!slug) {
    return { isValid: false, isMetaEngitech: false, isShakambhari: false };
  }

  const isMetaEngitech = slug === 'meta_engitech_pune';
  const isShakambhari = slug === 'shakambhari';

  return {
    isValid: isMetaEngitech || isShakambhari,
    isMetaEngitech,
    isShakambhari,
  };
}

/**
 * Group data by quarter
 * @param data - Array of records with year and month fields
 * @returns Object with Q1, Q2, Q3, Q4 arrays
 */
export function groupByQuarter<T extends { year: string; month: string }>(
  data: T[]
): Record<'Q1' | 'Q2' | 'Q3' | 'Q4', T[]> {
  const grouped: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', T[]> = {
    Q1: [],
    Q2: [],
    Q3: [],
    Q4: [],
  };

  data.forEach((record) => {
    const month = parseInt(record.month);
    if (month >= 1 && month <= 3) {
      grouped.Q1.push(record);
    } else if (month >= 4 && month <= 6) {
      grouped.Q2.push(record);
    } else if (month >= 7 && month <= 9) {
      grouped.Q3.push(record);
    } else if (month >= 10 && month <= 12) {
      grouped.Q4.push(record);
    }
  });

  return grouped;
}

/**
 * Check if a month is within a time range
 * @param month - Month number (1-12)
 * @param range - TimeRange object
 * @returns True if month is within range
 */
export function isMonthInRange(month: number, range: TimeRange): boolean {
  return range.months.includes(month);
}
