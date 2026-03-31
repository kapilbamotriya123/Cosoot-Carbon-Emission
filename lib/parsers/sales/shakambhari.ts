import ExcelJS from "exceljs";
import type { SalesParser, SalesRecord } from "./types";
import { resolveColumns, toNumberOrNull } from "../utils";

/**
 * Parser for Shakambhari's sales data Excel format.
 *
 * We only parse Sheet1 (the first sheet) which contains the primary sales data.
 *
 * Header pattern (columns A–F):
 *   A: INVNO          — Invoice number (used for deduplication)
 *   B: INV DT         — Invoice date (Date object or DD/MM/YY string)
 *   C: SOLD TO CODE   — Customer code (e.g. "60001073")
 *   D: SOLD TO NAME   — Customer name (not stored, just for debugging)
 *   E: MATERIAL DESCRIPTION — Product name (used as materialId since no numeric code exists)
 *   F: Inv Qty        — Quantity in metric tonnes
 *
 * Row filtering & aggregation:
 *   - Skip rows with qty=0 or null (header/container lines)
 *   - Negative quantities (credit notes/returns) are included in aggregation
 *   - All rows are aggregated by (year, month, customerCode, materialId) with summed quantities
 */

const EXPECTED_HEADERS = {
  invNo: "INVNO",
  invDate: "INV DT",
  soldToCode: "SOLD TO CODE",
  materialDesc: "MATERIAL DESCRIPTION",
  invQty: "Inv Qty",
};

/**
 * Check if a worksheet has the expected sales header pattern.
 * Returns resolved column indices if yes, null if no.
 */
function tryResolveHeaders(
  ws: ExcelJS.Worksheet
): Record<string, number> | null {
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (name) colMap[name] = colNumber;
  });

  try {
    return resolveColumns(colMap, EXPECTED_HEADERS, {
      aliases: {
        invQty: ["Inv Qty", "Invoice Qty", "Invoice Quantity", "Quantity"],
        soldToCode: ["SOLD TO CODE", "Sold To Code", "Customer Code"],
        materialDesc: [
          "MATERIAL DESCRIPTION",
          "Material Description",
          "Material",
        ],
      },
    });
  } catch {
    // This sheet doesn't have the right headers — skip it
    return null;
  }
}

/**
 * Extract year and month from an Excel date cell value.
 *
 * Handles:
 *   - Native Date objects (ExcelJS auto-parses date-formatted cells)
 *   - DD/MM/YY or DD/MM/YYYY strings (Indian date format used by Shakambhari)
 *   - ISO strings like "2025-03-30"
 *   - Formula results that resolve to any of the above
 */
function parseDateCell(
  value: ExcelJS.CellValue
): { year: number; month: number } | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }

  // Handle formula results or rich text
  if (typeof value === "object" && value !== null) {
    const obj = value as unknown as Record<string, unknown>;
    if ("result" in obj) {
      return parseDateCell(obj.result as ExcelJS.CellValue);
    }
  }

  // Handle Excel serial date numbers (e.g. 45726 = March 10, 2025).
  // ExcelJS sometimes returns raw serial numbers for date-formatted cells.
  if (typeof value === "number" && value > 1 && value < 200000) {
    // Excel epoch: Jan 1, 1900 = serial 1 (with the famous Lotus 1-2-3
    // leap year bug: serial 60 = Feb 29, 1900 which doesn't exist).
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  const str = String(value).trim();

  // DD/MM/YY or DD/MM/YYYY (Indian date format)
  const ddmmyy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (ddmmyy) {
    const day = parseInt(ddmmyy[1], 10);
    const month = parseInt(ddmmyy[2], 10);
    let year = parseInt(ddmmyy[3], 10);
    // 2-digit year: 00-49 → 2000s, 50-99 → 1900s
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month };
    }
  }

  // ISO format fallback: YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10) };
  }

  return null;
}

export const parseShakambhariSales: SalesParser = async (
  buffer: ArrayBuffer
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  if (workbook.worksheets.length === 0) {
    throw new Error("No worksheets found in the uploaded file");
  }

  // Only parse Sheet1 (the first sheet) — it contains the primary sales data.
  const ws = workbook.worksheets[0];
  const COL = tryResolveHeaders(ws);

  if (!COL) {
    throw new Error(
      `Sheet "${ws.name}" does not have the expected headers. ` +
        "Expected columns: INVNO, INV DT, SOLD TO CODE, MATERIAL DESCRIPTION, Inv Qty"
    );
  }

  // Aggregate quantities by (year, month, customerCode, materialId).
  // A single customer+material may appear across many invoice lines — some
  // positive (shipments) and some negative (credit notes / returns).
  // We sum everything and keep only net-positive totals.
  const aggMap = new Map<string, { year: number; month: number; customerCode: string; materialId: string; qty: number }>();
  let rawRowCount = 0;

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const qty = toNumberOrNull(row.getCell(COL.invQty).value);
    if (qty === null || qty === 0) continue; // skip zero/empty, keep negatives

    const customerCode = String(
      row.getCell(COL.soldToCode).value ?? ""
    ).trim();
    const materialDesc = String(
      row.getCell(COL.materialDesc).value ?? ""
    ).trim();

    if (!customerCode || !materialDesc) continue;

    const parsed = parseDateCell(row.getCell(COL.invDate).value);
    if (!parsed) {
      throw new Error(
        `Invalid date at row ${rowNum} in sheet "${ws.name}". ` +
          `Value: "${row.getCell(COL.invDate).value}"`
      );
    }

    rawRowCount++;
    const key = `${parsed.year}|${parsed.month}|${customerCode}|${materialDesc}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      aggMap.set(key, {
        year: parsed.year,
        month: parsed.month,
        customerCode,
        materialId: materialDesc,
        qty,
      });
    }
  }

  const records: SalesRecord[] = [];
  for (const agg of aggMap.values()) {
    records.push({
      year: agg.year,
      month: agg.month,
      customerCode: agg.customerCode,
      materialId: agg.materialId,
      quantityMT: Math.abs(agg.qty),
    });
  }

  if (records.length === 0) {
    throw new Error(
      `Sheet "${ws.name}" has the correct headers but no valid sales rows ` +
        "(all quantities were zero or missing)."
    );
  }

  console.log(
    `[sales-parser] Shakambhari: ${rawRowCount} raw rows → ${records.length} aggregated records from sheet "${ws.name}"`
  );

  return records;
};
