/**
 * Sheet filler for "D_Processes" — Production process level emissions.
 *
 * This sheet calculates Specific Embedded Emissions (SEE) for each production
 * process. Meta Engitech has 1 process: "ERW tubes, CEW tubes".
 *
 * Only Production process 1 (rows 11–72) is filled. The template supports up
 * to 10 processes (rows 76+, 141+, etc.) but Meta only has one.
 *
 * FILL_IN cells for process 1:
 *
 *   L16  — Total production level (tonnes sold to customer for selected materials)
 *   L27  — Produced for the market (same as L16, all production is for market)
 *   L41  — Consumed for non-CBAM goods (always 0 for Meta)
 *   K50  — Measurable heat applicable (static: false/true per company)
 *   L50  — Waste gases applicable (static: false/true per company)
 *   L54  — Directly attributable emissions (tCO2e) — scope1_intensity × quantity
 *   L65  — Electricity consumption (MWh) — back-calculated from scope2_intensity
 *   L66  — Emission factor of electricity (tCO2/MWh) — constant, e.g. 0.598
 *   L67  — Source of emission factor (static: "Mix")
 *   L71  — Electricity exported (MWh) — always 0
 *   L72  — Emission factor of exported electricity (tCO2/MWh) — same constant
 *
 * Columns/cells NOT to write (formulas):
 *   L24 (=SUM(L16:L23)), L28, L29, L42, M50 (auto from goods category),
 *   K54, K65, K66, K67, K71, K72 (all unit labels are formulas)
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillDProcesses(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "D_Processes");

  if (ctx.companySlug !== "meta_engitech_pune") {
    console.log(
      `[reports] D_Processes: skipping for ${ctx.companySlug} (not yet implemented)`
    );
    return;
  }

  if (!ctx.dProcesses) {
    throw new Error(
      "D_Processes requires customer/material data on context — was loadDProcessesData skipped?"
    );
  }

  const d = ctx.dProcesses;
  const p = ctx.companyProfile;

  // (a) L16: Total production level — quantity sold to this customer
  setCellValue(sheet, "L16", d.totalQuantityMT);

  // (b) L27: Produced for the market — same as total (all production is for market)
  setCellValue(sheet, "L27", d.totalQuantityMT);

  // (d) L41: Consumed for non-CBAM goods — 0 for Meta Engitech
  setCellValue(sheet, "L41", 0);

  // (f) K50, L50: Applicable elements selection
  setCellValue(sheet, "K50", p.measurableHeatApplicable);
  setCellValue(sheet, "L50", p.wasteGasesApplicable);

  // (g) L54: Directly attributable emissions (DirEm) in tCO2e
  setCellValue(sheet, "L54", d.totalDirectEmissionsCO2e);

  // (j) L65–L67: Indirect emissions from electricity consumption
  setCellValue(sheet, "L65", d.totalElectricityMWh);
  setCellValue(sheet, "L66", d.electricityEF);
  setCellValue(sheet, "L67", p.electricityEFSource);

  // (k) L71–L72: Electricity exported — always 0, but EF still filled
  setCellValue(sheet, "L71", 0);
  setCellValue(sheet, "L72", d.electricityEF);
}
