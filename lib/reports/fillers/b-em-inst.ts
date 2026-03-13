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
 * --- Meta Engitech ---
 * Simple combustion model: 2 rows (Diesel, LPG).
 *   Method = "Combustion", EF in column J (tCO2/TJ), NCV in column H.
 *
 * --- Shakambhari ---
 * Carbon mass balance model. Source streams are grouped per product:
 *
 *   [Product header row]  — E = short name (e.g. "FeMn"), no method
 *   [Input rows]          — D = "Process emissions", F = qty (positive), J = EF (tCO2/t)
 *   [Output rows]         — D = "Mass Balance", F = qty (negative), L = carbon content
 *
 * Input EF = carbonContent × 44/12 (CO2 molecular weight / C atomic weight).
 * Output rows show raw carbon content in column L instead of EF in column J.
 * Activity data is negative for outputs — this is the mass balance convention:
 *   carbon in (inputs) minus carbon out (products + byproducts) = process emissions.
 *
 * FILL_IN columns per row:
 *   D = Method ("Combustion" | "Process emissions" | "Mass Balance")
 *   E = Source stream name
 *   F = Activity data (tonnes) — positive for inputs, negative for outputs
 *   G = AD Unit ("t")
 *   H = Net calorific value (NCV) — only for combustion
 *   J = Emission factor (EF) — for combustion (tCO2/TJ) and process emissions (tCO2/t)
 *   K = EF Unit ("tCO2/TJ" or "tCO2/t")
 *   L = Carbon content — only for mass balance outputs
 *   P = Conversion factor (100 for Shakambhari rows)
 *
 * Columns NOT to write (formulas):
 *   I = NCV Unit (shared formula)
 *   M = C-Content Unit (shared formula — auto-shows "tC/t" when method is "Mass Balance")
 *   O = OxF Unit (pre-filled "%")
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue } from "../template";

export function fillBEmInst(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "B_EmInst");

  if (ctx.companySlug === "shakambhari") {
    fillShakambhari(ctx);
    return;
  }

  // --- Meta Engitech: combustion model ---

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

/**
 * Fill B_EmInst for Shakambhari using carbon mass balance source streams.
 *
 * Template layout per product group (matching the sample report):
 *   Row N:   Product header — just E = short name (e.g. "FeMn")
 *   Row N+1: First input — D="Process emissions", E=compName, F=qty, G="t", J=EF, K="tCO2/t", P=100
 *   ...more inputs...
 *   Row M:   First output — D="Mass Balance", E=compName, F=-qty, G="t", L=carbonContent, P=100
 *   ...more outputs...
 *   Row M+X: Next product header...
 *
 * Starts at row 17 (first FILL_IN row after examples).
 * Max row 48 (rows 49+ have a different shared formula reference).
 */
function fillShakambhari(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "B_EmInst");
  const streams = ctx.shakambhariSourceStreams;

  if (!streams || streams.length === 0) {
    console.log(
      "[reports] B_EmInst: no source streams for Shakambhari — skipping"
    );
    return;
  }

  const MAX_ROW = 48; // Last safe row in the first shared formula range

  // Clear all FILL_IN cells in rows 17–MAX_ROW.
  // The Shakambhari template ships with sample data pre-filled (FeMn + SiMn).
  // If we don't clear first, leftover values bleed through — e.g. a template
  // "Process emissions" EF in column J ends up on a row we use for "Mass Balance".
  const FILL_COLS = ["D", "E", "F", "G", "H", "J", "K", "L", "P"];
  for (let r = 17; r <= MAX_ROW; r++) {
    for (const col of FILL_COLS) {
      const cell = sheet.getCell(`${col}${r}`);
      // Only clear non-formula cells (FILL_IN cells are plain values)
      const v = cell.value;
      const isFormula =
        v !== null &&
        v !== undefined &&
        typeof v === "object" &&
        ("formula" in v || "sharedFormula" in v);
      if (!isFormula) {
        cell.value = null;
      }
    }
  }

  let row = 17; // First FILL_IN row

  for (const product of streams) {
    if (row > MAX_ROW) {
      console.warn(
        `[reports] B_EmInst: ran out of rows at ${row} (max ${MAX_ROW}), ` +
          `skipping remaining products`
      );
      break;
    }

    // Product header row — just the short name in column E
    setCellValue(sheet, `E${row}`, product.productName);
    row++;

    // Input rows — "Process emissions" method, EF in column J
    for (const input of product.inputs) {
      if (row > MAX_ROW) break;
      // Skip sources with zero quantity (no contribution)
      if (input.totalQuantity === 0) continue;

      setCellValue(sheet, `D${row}`, "Process emissions");
      setCellValue(sheet, `E${row}`, input.compName);
      setCellValue(sheet, `F${row}`, input.totalQuantity);
      setCellValue(sheet, `G${row}`, "t");
      setCellValue(sheet, `J${row}`, input.emissionFactor);
      setCellValue(sheet, `K${row}`, "tCO2/t");
      setCellValue(sheet, `P${row}`, 100);
      row++;
    }

    // Output rows — "Mass Balance" method, carbon content in column L, negative qty
    for (const output of product.outputs) {
      if (row > MAX_ROW) break;
      if (output.totalQuantity === 0) continue;

      setCellValue(sheet, `D${row}`, "Mass Balance");
      setCellValue(sheet, `E${row}`, output.compName);
      setCellValue(sheet, `F${row}`, output.totalQuantity); // already negative
      setCellValue(sheet, `G${row}`, "t");
      setCellValue(sheet, `K${row}`, "tCO2/t");
      setCellValue(sheet, `L${row}`, output.carbonContent);
      setCellValue(sheet, `P${row}`, 100);
      row++;
    }
  }

  console.log(
    `[reports] B_EmInst Shakambhari: wrote ${row - 17} rows ` +
      `for ${streams.length} product(s)`
  );
}
