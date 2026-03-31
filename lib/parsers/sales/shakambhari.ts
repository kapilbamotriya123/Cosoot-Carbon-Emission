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
 * Row filtering:
 *   - Skip rows with qty ≤ 0 (qty=0 are header/container lines, negative = credit notes/returns)
 *   - Skip rows with empty material description or customer code
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

  // Fallback: try native Date parsing (handles ISO strings etc.)
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
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

  const records: SalesRecord[] = [];

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const qty = toNumberOrNull(row.getCell(COL.invQty).value);
    if (qty === null || qty <= 0) continue; // skip zero/negative/empty

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

    records.push({
      year: parsed.year,
      month: parsed.month,
      customerCode,
      materialId: materialDesc, // Shakambhari has no numeric material code
      quantityMT: qty,
    });
  }

  if (records.length === 0) {
    throw new Error(
      `Sheet "${ws.name}" has the correct headers but no valid sales rows ` +
        "(all quantities were zero, negative, or missing)."
    );
  }

  console.log(
    `[sales-parser] Shakambhari: parsed ${records.length} records from sheet "${ws.name}"`
  );

  return records;
};
