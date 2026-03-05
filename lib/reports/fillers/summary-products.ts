/**
 * Sheet filler for "Summary_Products" — Product summary for communication.
 *
 * This sheet lists each product type with its CN code, embedded emissions,
 * and qualifying parameters. Most columns are auto-calculated via formulas
 * from D_Processes and InputOutput sheets.
 *
 * Only 5 yellow (FILL_IN) cells need to be written in row 10:
 *
 *   D10  — Production process name (e.g. "ERW tubes, CEW tubes")
 *   F10  — CN Code (e.g. "73063012")
 *   H10  — Product name for invoices (e.g. "STAINLESS STEEL")
 *   P10  — Main reducing agent of the precursor (e.g. "Coal or coke")
 *   Q10  — Steel mill identification number (e.g. 0)
 *
 * All other cells in the row (E10, G10, I10–O10) are formulas that
 * auto-populate from other sheets. Do NOT write to them.
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillSummaryProducts(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "Summary_Products");

  if (ctx.companySlug !== "meta_engitech_pune") {
    console.log(
      `[reports] Summary_Products: skipping for ${ctx.companySlug} (not yet implemented)`
    );
    return;
  }

  const p = ctx.companyProfile;

  setCellValue(sheet, "D10", p.summaryProcessName);
  setCellValue(sheet, "F10", p.summaryCNCode);
  setCellValue(sheet, "H10", p.summaryProductName);
  setCellValue(sheet, "P10", p.summaryReducingAgent);
  setCellValue(sheet, "Q10", p.summarySteelMillId);
}
