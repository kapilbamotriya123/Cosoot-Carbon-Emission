/**
 * Sales data types.
 *
 * A SalesRecord represents one row from the sales Excel file:
 * a single customer buying a single material in a given month.
 *
 * The parser returns an array of these records — no aggregation,
 * no deduplication. Raw rows are preserved as-is from the Excel.
 * Aggregation happens at query time (report generation).
 */

export interface SalesRecord {
  year: number;
  month: number;
  customerCode: string;
  materialId: string;
  quantityMT: number;
}

export type SalesParser = (buffer: ArrayBuffer) => Promise<SalesRecord[]>;
