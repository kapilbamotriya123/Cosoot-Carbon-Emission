/**
 * Sheet filler for "A_InstData" — the first sheet in the CBAM template.
 *
 * This sheet captures:
 *   1. Reporting period (start/end dates)
 *   2. About the installation (company name, address, contact)
 *   3. Verifier (optional — skipped in V1)
 *   4a. Aggregated goods categories and production routes
 *   4b. Production processes
 *   5. Purchased precursors
 *
 * All FILL_IN cell addresses were verified against the template dump:
 *   Report Sample ALTA_A_InstData.txt
 *
 * Cell layout note: Most Section 2 fields are visually merged across columns
 * I through N (columns 9–14). In the raw file these are NOT true Excel merges
 * but repeated values across all 6 cells. We write to every cell in the range
 * using setRowRange() to match this pattern.
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue, setRowRange } from "../template";

export function fillAInstData(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "A_InstData");
  const p = ctx.companyProfile;
  const period = ctx.period;

  // Convenience: set columns I through N on a given row (the standard
  // display range for Section 2 fields).
  const setIN = (row: number, value: string | number | Date) =>
    setRowRange(sheet, "I", "N", row, value);

  // ------------------------------------------------------------------
  // Section 1: Reporting Period
  //
  // I9 / J9  = start date of reporting period
  // L9 / M9  = end date of reporting period
  //
  // ExcelJS writes Date objects as Excel serial numbers, which display
  // correctly when the cell is already formatted as a date (as it is here).
  // ------------------------------------------------------------------
  setCellValue(sheet, "I9", period.startDate);
  setCellValue(sheet, "J9", period.startDate);
  setCellValue(sheet, "L9", period.endDate);
  setCellValue(sheet, "M9", period.endDate);

  // ------------------------------------------------------------------
  // Section 2: About the Installation
  //
  // Row 20: Legal name (English)
  // Row 21: Street / address
  // Row 22: Economic activity — label only, no FILL_IN cell
  // Row 23: Post code
  // Row 24: P.O. Box — no FILL_IN cell in template
  // Row 25: City
  // Row 26: Country
  // Row 27: UNLOCODE
  // Row 28: Latitude
  // Row 29: Longitude
  // Row 30: Authorized representative name
  // Row 31: Email
  // Row 32: Telephone
  // ------------------------------------------------------------------
  setIN(20, p.legalName);
  setIN(21, p.streetAddress);
  setIN(23, p.postCode);
  setIN(25, p.city);
  setIN(26, p.country);
  setIN(27, p.unlocode);
  setIN(28, p.latitude);
  setIN(29, p.longitude);
  setIN(30, p.authorizedRepName);
  setIN(31, p.email);
  setIN(32, p.telephone);

  // ------------------------------------------------------------------
  // Section 3: Verifier
  // All fields are optional during the CBAM transitional period.
  // Intentionally left empty.
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Section 4a: Aggregated Goods Categories
  //
  // Row 61: Headers (formula-driven, no FILL_IN)
  // Rows 62–71 (G1–G10): goods category entries
  //   E/F  = goods category name
  //   G/H  = route (formula: auto-fills based on E)
  //   I–M  = Route 1–5 (FILL_IN: "All production routes")
  //
  // Meta Engitech: 1 row (one category).
  // Shakambhari: 1 row per selected product (all same category).
  // ------------------------------------------------------------------
  if (ctx.companySlug === "shakambhari") {
    // One goods-category row per selected product
    for (let i = 0; i < ctx.materialIds.length && i < 10; i++) {
      const row = 62 + i;
      setCellValue(sheet, `E${row}`, p.goodsCategory);
      setCellValue(sheet, `F${row}`, p.goodsCategory);
      setCellValue(sheet, `I${row}`, p.productionRoutes);
      setCellValue(sheet, `J${row}`, p.productionRoutes);
    }
  } else {
    // Meta Engitech: single row
    setCellValue(sheet, "E62", p.goodsCategory);
    setCellValue(sheet, "F62", p.goodsCategory);
    for (const col of ["I", "J", "K", "L", "M"] as const) {
      setCellValue(sheet, `${col}62`, p.productionRoutes);
    }
  }

  // ------------------------------------------------------------------
  // Section 4b: Production Processes
  //
  // Row 81–82: Headers (formula-driven)
  // Rows 83–92 (P1–P10): production process entries
  //   E       = aggregated goods category reference
  //   F       = scope ("Only direct production")
  //   G–K     = included goods 1–6 ("n.a." when scope is "direct only")
  //   L / M   = process name
  //   N       = error check formula — not a FILL_IN cell
  //
  // Meta Engitech: 1 row (one process).
  // Shakambhari: 1 row per selected product (dynamic names from materialIds).
  // ------------------------------------------------------------------
  if (ctx.companySlug === "shakambhari") {
    // One process row per selected product
    for (let i = 0; i < ctx.materialIds.length && i < 10; i++) {
      const row = 83 + i;
      setCellValue(sheet, `E${row}`, p.goodsCategory);
      setCellValue(sheet, `F${row}`, p.processScope);
      setCellValue(sheet, `L${row}`, ctx.materialIds[i]);
      setCellValue(sheet, `M${row}`, ctx.materialIds[i]);
    }
  } else {
    // Meta Engitech: single row
    setCellValue(sheet, "E83", p.goodsCategory);
    setCellValue(sheet, "F83", p.processScope);
    for (const col of ["G", "H", "I", "J", "K"] as const) {
      setCellValue(sheet, `${col}83`, "n.a.");
    }
    setCellValue(sheet, "L83", p.processName);
    setCellValue(sheet, "M83", p.processName);
  }

  // ------------------------------------------------------------------
  // Section 5: Purchased Precursors
  //
  // Rows 102–121 (PP1–PP20): purchased precursor entries
  //   E       = production process reference
  //   F       = country code
  //   G–K     = production routes
  //   L / M   = precursor name
  //   N       = error check formula — not a FILL_IN cell
  //
  // Meta Engitech: 1 precursor (MS STEEL COIL).
  // Shakambhari: No precursors — section left empty.
  // ------------------------------------------------------------------
  if (ctx.companySlug !== "shakambhari") {
    setCellValue(sheet, "E102", p.goodsCategory);
    setCellValue(sheet, "F102", p.precursorCountryCode);
    for (const col of ["G", "H", "I", "J", "K"] as const) {
      setCellValue(sheet, `${col}102`, p.productionRoutes);
    }
    setCellValue(sheet, "L102", p.precursorName);
    setCellValue(sheet, "M102", p.precursorName);
  }
}
