import ExcelJS from "exceljs";
import type { SalesParser, SalesRecord } from "./types";
import { resolveColumns, toNumberOrNull } from "../utils";

/**
 * Parser for Meta Engitech Pune's sales data Excel format.
 *
 * Expected layout:
 *   Row 1: Column headers
 *   Row 2+: Data rows
 *
 * Headers:
 *   - Month: "Jan-25" format (Mon-YY) — parsed to extract year and month
 *   - customer code: Numeric customer ID
 *   - Material: Product/material ID string
 *   - Qty in MT: Quantity sold in metric tonnes
 *
 * Month parsing:
 *   "Jan-25" → { month: 1, year: 2025 }
 *   "Dec-24" → { month: 12, year: 2024 }
 *   The two-digit year is assumed 2000s (25 → 2025).
 */

const EXPECTED_HEADERS = {
  month: "Month",
  customerCode: "customer code",
  material: "Material",
  quantityMT: "Qty in MT",
};

/** Maps 3-letter month abbreviations to month numbers (1-12). */
const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse "Jan-25" → { month: 1, year: 2025 }
 * Also handles "January-25" or "JAN-2025" for resilience.
 */
function parseMonthCell(value: ExcelJS.CellValue): { month: number; year: number } | null {
  if (value == null || value === "") return null;

  // If ExcelJS parsed it as a Date object, extract directly
  if (value instanceof Date) {
    return { month: value.getMonth() + 1, year: value.getFullYear() };
  }

  // ExcelJS can return rich objects like { richText: [...] } or { text: "...", ... }
  // or even { result: "Jan-25", ... } for formula cells.
  // Extract the text content from any object form.
  let str: string;
  if (typeof value === "object" && value !== null) {
    const obj = value as unknown as Record<string, unknown>;
    if ("result" in obj) {
      // Formula cell — use the computed result
      return parseMonthCell(obj.result as ExcelJS.CellValue);
    }
    if ("richText" in obj && Array.isArray(obj.richText)) {
      // Rich text — concatenate all text segments
      str = (obj.richText as Array<{ text: string }>).map((r) => r.text).join("");
    } else if ("text" in obj) {
      str = String(obj.text);
    } else {
      str = String(value);
    }
  } else {
    str = String(value);
  }

  str = str.trim();
  const parts = str.split("-");
  if (parts.length !== 2) return null;

  const monthStr = parts[0].trim().toLowerCase().slice(0, 3); // "january" → "jan"
  const yearStr = parts[1].trim();

  const month = MONTH_ABBR[monthStr];
  if (!month) return null;

  let year = parseInt(yearStr, 10);
  if (isNaN(year)) return null;

  // Two-digit year → assume 2000s
  if (year < 100) year += 2000;

  return { month, year };
}

export const parseMetaEngitechPuneSales: SalesParser = async (
  buffer: ArrayBuffer
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  // Locate the header row by scanning the first N rows. Client files sometimes
  // have a title row, a "Table 1" label, blank rows, or hidden rows above the
  // real headers — so we don't hard-code row 1. We pick the first row whose
  // cells resolve to all four required columns (with aliases).
  //
  // Note: this file may have two tables side by side (sales in cols A-D, summary
  // in cols G-H), both with "Month" and "Qty in MT" headers. Building the colMap
  // with first-occurrence-wins keeps us pointed at the sales table.
  const MAX_HEADER_SCAN_ROWS = 20;
  const aliasOpts = {
    aliases: {
      quantityMT: ["Qty in MT", "Quantity in MT", "Qty MT", "Quantity MT"],
      customerCode: ["Customer Code", "Customer ID", "customer id"],
      material: ["Material ID", "Material Code", "material"],
    },
  };

  let COL: Record<string, number> | null = null;
  let headerRowNum = -1;
  const scanLimit = Math.min(MAX_HEADER_SCAN_ROWS, worksheet.rowCount);

  for (let r = 1; r <= scanLimit; r++) {
    const colMap: Record<string, number> = {};
    worksheet.getRow(r).eachCell((cell, colNumber) => {
      const name = String(cell.value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
      if (name && !(name in colMap)) colMap[name] = colNumber;
    });
    try {
      COL = resolveColumns(colMap, EXPECTED_HEADERS, aliasOpts);
      headerRowNum = r;
      break;
    } catch {
      // Not the header row — keep scanning.
    }
  }

  if (!COL || headerRowNum === -1) {
    throw new Error(
      `Could not locate the header row in the first ${scanLimit} rows. ` +
        `Expected a row with columns: Month, customer code, Material, Qty in MT.`
    );
  }

  const records: SalesRecord[] = [];

  for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);

    // Stop on empty row (no month value and no customer code)
    const monthRaw = row.getCell(COL.month).value;
    const customerRaw = row.getCell(COL.customerCode).value;
    if (monthRaw == null && customerRaw == null) break;
    if (monthRaw == null) continue; // skip rows without a month

    const parsed = parseMonthCell(monthRaw);
    if (!parsed) {
      throw new Error(
        `Invalid month format "${monthRaw}" at row ${rowNum}. Expected format: "Jan-25" (Mon-YY).`
      );
    }

    const customerCode = String(customerRaw ?? "").trim();
    if (!customerCode) continue;

    const materialId = String(row.getCell(COL.material).value ?? "").trim();
    if (!materialId) continue;

    const quantityMT = toNumberOrNull(row.getCell(COL.quantityMT).value);
    if (quantityMT === null || quantityMT === 0) continue;

    records.push({
      year: parsed.year,
      month: parsed.month,
      customerCode,
      materialId,
      quantityMT,
    });
  }

  if (records.length === 0) {
    throw new Error(
      "No sales records found in the file. Check that the format matches the expected structure " +
        "(headers: Month, customer code, Material, Qty in MT)."
    );
  }

  return records;
};
