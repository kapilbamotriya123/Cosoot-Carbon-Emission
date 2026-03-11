import ExcelJS from "exceljs";
import type { SalesParser, SalesRecord } from "./types";
import { resolveColumns, toNumberOrNull } from "../utils";

/**
 * Parser for Shakambhari's sales data Excel format.
 *
 * Shakambhari's sales export contains multiple sheets (typically 5), where:
 *   - Sheet1: Prime products only, 19 columns (no financial data)
 *   - Sheet3: ALL products including by-products (slag, shots, fines), 43 columns
 *   - Sheet4/5: Subsets of Sheet1 — different plants or export-only
 *   - Sheet2: Pivot table (no material description) — skipped
 *
 * Sheet1 + Sheet3 = complete dataset with zero overlap.
 * Sheet4/5 are strict subsets of Sheet1. We parse ALL sheets with the right
 * header pattern and deduplicate, so the parser is resilient to any combination.
 *
 * Header pattern (columns A–F in sheets 1/3/4/5):
 *   A: INVNO          — Invoice number (used for deduplication)
 *   B: INV DT         — Invoice date (Date object)
 *   C: SOLD TO CODE   — Customer code (e.g. "60001073")
 *   D: SOLD TO NAME   — Customer name (not stored, just for debugging)
 *   E: MATERIAL DESCRIPTION — Product name (used as materialId since no numeric code exists)
 *   F: Inv Qty        — Quantity in metric tonnes
 *
 * Row filtering:
 *   - Skip rows with qty ≤ 0 (qty=0 are header/container lines, negative = credit notes/returns)
 *   - Skip rows with empty material description or customer code
 *
 * Deduplication:
 *   Key = invNo|customerCode|materialDescription|qty
 *   This handles Sheet4/5 being subsets of Sheet1 without double-counting.
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

  // Try parsing as string
  const d = new Date(String(value));
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

  // Collect rows from all sheets that match the header pattern.
  // Deduplicate using a composite key to avoid double-counting when
  // multiple sheets contain the same invoice line items.
  const seen = new Set<string>();
  const records: SalesRecord[] = [];
  let sheetsMatched = 0;

  for (const ws of workbook.worksheets) {
    const COL = tryResolveHeaders(ws);
    if (!COL) continue; // sheet doesn't have the right headers

    sheetsMatched++;

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const qty = toNumberOrNull(row.getCell(COL.invQty).value);
      if (qty === null || qty <= 0) continue; // skip zero/negative/empty

      const invNo = String(row.getCell(COL.invNo).value ?? "").trim();
      const customerCode = String(
        row.getCell(COL.soldToCode).value ?? ""
      ).trim();
      const materialDesc = String(
        row.getCell(COL.materialDesc).value ?? ""
      ).trim();

      if (!customerCode || !materialDesc) continue;

      // Deduplicate across sheets
      const dedupeKey = `${invNo}|${customerCode}|${materialDesc}|${qty}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

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
  }

  if (sheetsMatched === 0) {
    throw new Error(
      "No worksheet with the expected headers found. " +
        "Expected columns: INVNO, INV DT, SOLD TO CODE, MATERIAL DESCRIPTION, Inv Qty"
    );
  }

  if (records.length === 0) {
    throw new Error(
      `Found ${sheetsMatched} sheet(s) with correct headers but no valid sales rows ` +
        "(all quantities were zero, negative, or missing)."
    );
  }

  console.log(
    `[sales-parser] Shakambhari: parsed ${records.length} records ` +
      `from ${sheetsMatched} sheet(s), ` +
      `${seen.size} unique line items`
  );

  return records;
};
