/**
 * Sheet filler for "Summary_Products" — Product summary for communication.
 *
 * This sheet lists each product type with its CN code, embedded emissions,
 * and qualifying parameters. Most columns are auto-calculated via formulas
 * from D_Processes and InputOutput sheets.
 *
 * FILL_IN cells per product row (starting at row 10):
 *
 *   D  — Production process name (must match D_Processes process name)
 *   F  — CN Code (8-digit, e.g. "72021120")
 *   H  — Product name for invoices
 *   P  — Main reducing agent of the precursor (e.g. "Coal or coke")
 *   Q  — Steel mill identification number (0 for non-steel)
 *
 * --- Meta Engitech ---
 * Single product in row 10. All values from company profile.
 *
 * --- Shakambhari ---
 * One row per selected material (row 10, 11, 12...).
 * D = process name matching D_Processes block, F = CN code from user selection,
 * H = product display name, P = "Coal or coke", Q = 0.
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillSummaryProducts(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "Summary_Products");

  if (ctx.companySlug === "shakambhari") {
    fillShakambhari(ctx);
    return;
  }

  // --- Meta Engitech: single product row ---
  const p = ctx.companyProfile;

  setCellValue(sheet, "D10", p.summaryProcessName);
  setCellValue(sheet, "F10", p.summaryCNCode);
  setCellValue(sheet, "H10", p.summaryProductName);
  setCellValue(sheet, "P10", p.summaryReducingAgent);
  setCellValue(sheet, "Q10", p.summarySteelMillId);
}

/**
 * Fill Summary_Products for Shakambhari — one row per selected material.
 *
 * The process name in column D must match the process name used in
 * D_Processes (which uses the same short label: "Ferro Manganese", "Silico Manganese").
 * This is how the template's formulas link products to their processes.
 */
function fillShakambhari(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "Summary_Products");
  const materialIds = ctx.materialIds;
  const cnCodes = ctx.cnCodes;

  for (let i = 0; i < materialIds.length; i++) {
    const row = 10 + i;
    const materialId = materialIds[i];

    // Process name must match D_Processes — use the short label
    // "Ferro Manganese (70-75) Prime" → "Ferro Manganese"
    // "Silico Manganese (65-70) Prime" → "Silico Manganese"
    const processName = materialId.includes("Ferro")
      ? "Ferro Manganese"
      : materialId.includes("Silico")
        ? "Silico Manganese"
        : materialId;

    // CN code from user selection (or empty if not provided)
    const cnCode = cnCodes[materialId] || "";

    // Product name for invoices — use the full material name
    const productName = materialId;

    setCellValue(sheet, `D${row}`, processName);
    setCellValue(sheet, `F${row}`, cnCode);
    setCellValue(sheet, `H${row}`, productName);
    setCellValue(sheet, `P${row}`, "Coal or coke");
    setCellValue(sheet, `Q${row}`, 0);
  }

  console.log(
    `[reports] Summary_Products: wrote ${materialIds.length} product row(s)`
  );
}
