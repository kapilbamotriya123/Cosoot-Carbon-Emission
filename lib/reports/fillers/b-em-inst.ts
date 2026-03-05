/**
 * Sheet filler for "B_EmInst" — Source streams (direct emission sources).
 *
 * This sheet lists each fuel/source stream used at the installation, along
 * with its total consumption (Activity Data), NCV, and Emission Factor.
 *
 * Layout:
 *   Row 13: Headers
 *   Rows 14–16: Examples (grey, pre-filled — do NOT touch)
 *   Rows 17–91: FILL_IN rows (up to 75 source stream entries)
 *
 * For Meta Engitech there are 2 combustion source streams:
 *   Row 17: Diesel
 *   Row 18: LPG
 *
 * FILL_IN columns per row:
 *   D = Method (e.g. "Combustion")
 *   E = Source stream name (e.g. "Diesel")
 *   F = Activity data — total consumption in tonnes for the quarter
 *   G = AD Unit ("t")
 *   H = Net calorific value (NCV)
 *   J = Emission factor (EF)
 *   K = EF Unit ("tCO2/TJ")
 *
 * Columns NOT to write (formulas that auto-calculate):
 *   I = NCV Unit (SHARED_FORMULA based on G)
 *   M = C-Content Unit (SHARED_FORMULA based on method/unit)
 *   O = OxF Unit (pre-filled "%")
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillBEmInst(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "B_EmInst");

  if (ctx.companySlug !== "meta_engitech_pune") {
    // Shakambhari will have different source streams — skip for now
    console.log(
      `[reports] B_EmInst: skipping for ${ctx.companySlug} (not yet implemented)`
    );
    return;
  }

  if (!ctx.emissionConstants) {
    throw new Error(
      "B_EmInst requires emissionConstants on context — was pipeline data loading skipped?"
    );
  }

  const constants = ctx.emissionConstants;

  // Row 17: Diesel
  setCellValue(sheet, "D17", "Combustion");
  setCellValue(sheet, "E17", "Diesel");
  setCellValue(sheet, "F17", ctx.quarterDieselTonnes ?? 0);
  setCellValue(sheet, "G17", "t");
  setCellValue(sheet, "H17", constants.diesel_ncv);
  setCellValue(sheet, "J17", constants.diesel_ef);
  setCellValue(sheet, "K17", "tCO2/TJ");

  // Row 18: LPG
  setCellValue(sheet, "D18", "Combustion");
  setCellValue(sheet, "E18", "LPG");
  setCellValue(sheet, "F18", ctx.quarterLpgTonnes ?? 0);
  setCellValue(sheet, "G18", "t");
  setCellValue(sheet, "H18", constants.lpg_ncv);
  setCellValue(sheet, "J18", constants.lpg_ef);
  setCellValue(sheet, "K18", "tCO2/TJ");
}
