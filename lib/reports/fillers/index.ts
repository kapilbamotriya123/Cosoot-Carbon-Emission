/**
 * Filler registry — the single source of truth for which sheets get filled
 * and in what order.
 *
 * The pipeline in pipeline.ts iterates this array sequentially. Order
 * matters: earlier sheets may have cross-sheet formula dependencies that
 * later sheets rely on.
 *
 * To add a new sheet filler:
 *   1. Create the filler function in a new file (e.g. fillers/b-em-inst.ts)
 *   2. Add a FillerRegistration entry below in the correct position
 *   That's it — no changes to pipeline.ts needed.
 */

import type { FillerRegistration } from "../types";
import { fillAInstData } from "./a-inst-data";
import { fillBEmInst } from "./b-em-inst";
import { fillCEmissionsEnergy } from "./c-emissions-energy";
import { fillDProcesses } from "./d-processes";
import { fillEPurchPrec } from "./e-purch-prec";
import { fillSummaryProducts } from "./summary-products";

export const FILLER_REGISTRY: FillerRegistration[] = [
  {
    sheetName: "A_InstData",
    filler: fillAInstData,
    description:
      "Installation data: reporting period, company info, goods categories, processes, precursors",
  },

  {
    sheetName: "B_EmInst",
    filler: fillBEmInst,
    description: "Source streams: fuel consumption, NCV, and emission factors",
  },

  {
    sheetName: "C_Emissions&Energy",
    filler: fillCEmissionsEnergy,
    description: "GHG balance: indirect emissions, data quality approach",
  },

  {
    sheetName: "D_Processes",
    filler: fillDProcesses,
    description:
      "Process-level production and attributed emissions for SEE calculation",
  },

  {
    sheetName: "E_PurchPrec",
    filler: fillEPurchPrec,
    description:
      "Purchased precursor quantities and specific embedded emissions",
  },

  {
    sheetName: "Summary_Products",
    filler: fillSummaryProducts,
    description:
      "Product summary: CN code, product name, reducing agent, steel mill ID",
  },
];
