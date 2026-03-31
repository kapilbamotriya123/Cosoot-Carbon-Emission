/**
 * Sales data types.
 *
 * A SalesRecord represents one customer+material+month combination.
 *
 * For Shakambhari, the parser aggregates all invoice lines (positive
 * and negative) by (year, month, customerCode, materialId) and returns
 * the net quantity. Only net-positive totals are returned.
 */

export interface SalesRecord {
  year: number;
  month: number;
  customerCode: string;
  materialId: string;
  quantityMT: number;
}

export type SalesParser = (buffer: ArrayBuffer) => Promise<SalesRecord[]>;
