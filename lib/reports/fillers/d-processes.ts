/**
 * Sheet filler for "D_Processes" — Production process level emissions.
 *
 * This sheet calculates Specific Embedded Emissions (SEE) for each production
 * process. The template supports up to 10 processes, each in a 65-row block.
 *
 * --- Meta Engitech ---
 * Single process: "ERW tubes, CEW tubes". Uses ctx.dProcesses (aggregated).
 *
 * --- Shakambhari ---
 * One process per selected material (e.g. FeMn, SiMn). Each gets its own
 * 65-row block. Uses ctx.shakambhariDProcesses (per-product array).
 *
 * Template layout per process block (process N):
 *   Block start row = 11 + (N-1) × 65   (process 1 = row 11, 2 = 76, 3 = 141)
 *
 *   FILL_IN cells (offsets from block start):
 *     +5  (L16/L81/L146)  — Total production level (tonnes)
 *     +16 (L27/L92/L157)  — Produced for the market (same value)
 *     +30 (L41/L106/L171) — Consumed for non-CBAM goods (0)
 *     +39 K (K50/K115)    — Measurable heat applicable (false)
 *     +39 L (L50/L115)    — Waste gases applicable (false)
 *     +43 (L54/L119)      — Directly attributable emissions (tCO2e)
 *     +54 (L65/L130)      — Electricity consumption (MWh)
 *     +55 (L66/L131)      — Emission factor of electricity (tCO2/MWh)
 *     +56 (L67/L132)      — Source of emission factor
 *     +60 (L71/L136)      — Electricity exported (MWh) — 0
 *     +61 (L72/L137)      — EF of exported electricity — same as L66
 */

import type { ReportContext } from "../types";
import { getSheet, setCellValue, clearCell } from "../template";

/** Row offset for each FILL_IN cell within a process block. */
const OFFSETS = {
  totalProduction: 5,    // L16, L81, L146...
  producedForMarket: 16, // L27, L92, L157...
  nonCbamGoods: 30,      // L41, L106, L171...
  measurableHeat: 39,    // K50, K115...
  wasteGases: 39,        // L50, L115...
  directEmissions: 43,   // L54, L119...
  elecConsumption: 54,   // L65, L130...
  elecEF: 55,            // L66, L131...
  elecEFSource: 56,      // L67, L132...
  elecExported: 60,      // L71, L136...
  elecExportedEF: 61,    // L72, L137...
} as const;

/** Each process block starts 65 rows after the previous one. */
const BLOCK_SIZE = 65;
const FIRST_BLOCK_START = 11; // Process 1 header row

export function fillDProcesses(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "D_Processes");

  if (ctx.companySlug === "shakambhari") {
    fillShakambhari(ctx);
    return;
  }

  // --- Meta Engitech: single process ---

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

/**
 * Fill D_Processes for Shakambhari — one process block per selected material.
 *
 * Process 1 starts at row 11, process 2 at row 76, process 3 at row 141, etc.
 * Each block has the same layout, just shifted by 65 rows.
 */
function fillShakambhari(ctx: ReportContext): void {
  const sheet = getSheet(ctx.workbook, "D_Processes");
  const products = ctx.shakambhariDProcesses;
  const p = ctx.companyProfile;

  if (!products || products.length === 0) {
    console.log(
      "[reports] D_Processes: no Shakambhari product data — skipping"
    );
    return;
  }

  // Clear all process blocks first (up to 10 blocks).
  // The template ships with sample data in blocks 1–3 that would bleed
  // through if the user selects fewer products than the template had.
  const MAX_BLOCKS = 10;
  const CLEAR_OFFSETS = [
    OFFSETS.totalProduction,
    OFFSETS.producedForMarket,
    OFFSETS.nonCbamGoods,
    OFFSETS.directEmissions,
    OFFSETS.elecConsumption,
    OFFSETS.elecEF,
    OFFSETS.elecEFSource,
    OFFSETS.elecExported,
    OFFSETS.elecExportedEF,
  ];
  for (let i = 0; i < MAX_BLOCKS; i++) {
    const blockStart = FIRST_BLOCK_START + i * BLOCK_SIZE;
    for (const offset of CLEAR_OFFSETS) {
      clearCell(sheet, `L${blockStart + offset}`);
    }
    clearCell(sheet, `K${blockStart + OFFSETS.measurableHeat}`);
  }

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const blockStart = FIRST_BLOCK_START + i * BLOCK_SIZE;

    // (a) Total production level = quantity sold to customer
    setCellValue(sheet, `L${blockStart + OFFSETS.totalProduction}`, product.quantitySoldMT);

    // (b) Produced for the market = same
    setCellValue(sheet, `L${blockStart + OFFSETS.producedForMarket}`, product.quantitySoldMT);

    // (d) Consumed for non-CBAM goods = 0
    setCellValue(sheet, `L${blockStart + OFFSETS.nonCbamGoods}`, 0);

    // (f) Applicable elements: measurable heat = false, waste gases = false
    setCellValue(sheet, `K${blockStart + OFFSETS.measurableHeat}`, p.measurableHeatApplicable);
    setCellValue(sheet, `L${blockStart + OFFSETS.wasteGases}`, p.wasteGasesApplicable);

    // (g) Directly attributable emissions (scope 1)
    setCellValue(sheet, `L${blockStart + OFFSETS.directEmissions}`, product.directEmissionsCO2e);

    // (j) Electricity consumption + EF + source
    setCellValue(sheet, `L${blockStart + OFFSETS.elecConsumption}`, product.electricityMWh);
    setCellValue(sheet, `L${blockStart + OFFSETS.elecEF}`, product.electricityEF);
    setCellValue(sheet, `L${blockStart + OFFSETS.elecEFSource}`, p.electricityEFSource || "D.4.1");

    // (k) Electricity exported = 0, EF same
    setCellValue(sheet, `L${blockStart + OFFSETS.elecExported}`, 0);
    setCellValue(sheet, `L${blockStart + OFFSETS.elecExportedEF}`, product.electricityEF);

    console.log(
      `[reports] D_Processes block ${i + 1} (row ${blockStart}): ` +
        `${product.materialId} — ${product.quantitySoldMT}t, ` +
        `${product.directEmissionsCO2e.toFixed(2)} tCO2e, ` +
        `${product.electricityMWh.toFixed(2)} MWh`
    );
  }
}
