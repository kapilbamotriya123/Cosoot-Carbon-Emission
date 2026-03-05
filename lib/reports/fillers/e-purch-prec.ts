/**
 * Sheet filler for "E_PurchPrec" — Purchased precursor emissions.
 *
 * This sheet reports the precursor (raw material) consumed by the production
 * process, along with the specific embedded emissions of that precursor.
 *
 * Meta Engitech has 1 precursor: "MS STEEL COIL" (Iron or steel products).
 * Only Precursor 1 (rows 14–54) is filled.
 *
 * FILL_IN cells for precursor 1:
 *
 *   L17  — Total purchased level (tonnes): quantity sold × waste multiplier (1.1)
 *   L28  — Consumed in production process 1 (tonnes): same as L17
 *   L38  — Consumed for non-CBAM goods: always 0
 *   L49  — SEE (direct) (tCO2e/t): static per company
 *   M49  — SEE (direct) source: static per company
 *   L50  — Specific electricity consumption (MWh/t): static per company
 *   M50  — Source: static per company
 *   L51  — Electricity emission factor (tCO2e/MWh): static per company
 *   M51  — Source: static per company
 *   K54  — Justification for default values: static per company
 *   L54  — Justification (continued): same as K54
 *   M54  — Justification (continued): same as K54
 *
 * Columns/cells NOT to write (formulas):
 *   L25 (=SUM(L17:L24)), L39 (control formula), L52 (=L50*L51),
 *   K17/K28/K38/K49/K50/K51 (unit labels are formulas)
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillEPurchPrec(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "E_PurchPrec");

  if (ctx.companySlug !== "meta_engitech_pune") {
    console.log(
      `[reports] E_PurchPrec: skipping for ${ctx.companySlug} (not yet implemented)`
    );
    return;
  }

  if (!ctx.dProcesses) {
    throw new Error(
      "E_PurchPrec requires dProcesses data on context — was loadDProcessesData skipped?"
    );
  }

  const d = ctx.dProcesses;
  const p = ctx.companyProfile;

  // Purchased quantity = sold quantity × waste multiplier (e.g. 1.1 = 10% production loss)
  const purchasedQty = d.totalQuantityMT * p.precursorWasteMultiplier;

  // (a) L17: Total purchased level — quantity with waste factor applied
  setCellValue(sheet, "L17", purchasedQty);

  // (b) L28: Consumed in production process 1 — same as total purchased
  setCellValue(sheet, "L28", purchasedQty);

  // (c) L38: Consumed for non-CBAM goods — always 0
  setCellValue(sheet, "L38", 0);

  // (e) L49, M49: Specific embedded direct emissions (from precursor supplier)
  setCellValue(sheet, "L49", p.precursorSEEDirect);
  setCellValue(sheet, "M49", p.precursorSEEDirectSource);

  // L50, M50: Specific electricity consumption
  setCellValue(sheet, "L50", p.precursorElecConsumption);
  setCellValue(sheet, "M50", p.precursorElecConsumptionSource);

  // L51, M51: Electricity emission factor
  setCellValue(sheet, "L51", p.precursorElecEF);
  setCellValue(sheet, "M51", p.precursorElecEFSource);

  // (v) K54–M54: Justification for use of default values
  setCellValue(sheet, "K54", p.precursorDefaultJustification);
  setCellValue(sheet, "L54", p.precursorDefaultJustification);
  setCellValue(sheet, "M54", p.precursorDefaultJustification);
}
