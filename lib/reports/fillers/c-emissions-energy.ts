/**
 * Sheet filler for "C_Emissions&Energy" — GHG balance & data quality.
 *
 * This sheet is mostly auto-calculated from B_EmInst via cross-sheet formulas.
 * We only need to fill 3 areas:
 *
 *   M26  — Total indirect emissions (tCO2e), manually entered
 *   H40–N40 — Data quality approach (static dropdown value)
 *   H42  — Quality assurance approach (static dropdown value)
 *
 * M26 is computed from raw electricity consumption:
 *   SUM(totalEnergyKWh) × electricity_ef = tCO2e
 *
 * The rest of the sheet (rows 25, 27, 32, etc.) auto-calculates from
 * B_EmInst source stream data and from M26 via formulas.
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue, setRowRange } from "../template";

export function fillCEmissionsEnergy(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "C_Emissions&Energy");
  const p = ctx.companyProfile;

  // M26: Total indirect emissions (scope 2) — the only dynamic value
  setCellValue(sheet, "M26", ctx.quarterIndirectCO2e ?? 0);

  // H40–N40: Data quality approach
  setRowRange(sheet, "H", "N", 40, p.dataQualityApproach);

  // H42: Quality assurance approach
  setCellValue(sheet, "H42", p.qualityAssuranceApproach);
}
