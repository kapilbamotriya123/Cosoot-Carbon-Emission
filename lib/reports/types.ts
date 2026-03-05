/**
 * Shared types for the CBAM report generation pipeline.
 *
 * Pipeline overview:
 *   generateReport() builds a ReportContext, then runs each SheetFiller
 *   sequentially. Each filler writes its sheet's FILL_IN cells into the
 *   workbook. On any failure the whole pipeline aborts (fail-fast).
 */

import type ExcelJS from "exceljs";
import type { CompanySlug } from "@/lib/constants";
import type { MetaEngitechConstants } from "@/lib/emissions/constants-loader";

// ---- Reporting Period ------------------------------------------------

export interface ReportingPeriod {
  startDate: Date; // e.g. 2025-04-01
  endDate: Date; // e.g. 2025-06-30
  yearMonths: Array<{ year: number; month: number }>; // all months in range, e.g. [{year:2025,month:4}, ...]
}

// ---- Company Profile (static data written into the report) -----------

/**
 * Static information about an installation, used to fill A_InstData and
 * other sheets. Hardcoded per company in company-data.ts.
 *
 * All fields correspond directly to rows in the A_InstData sheet.
 */
export interface CompanyProfile {
  // Section 2 – About the installation
  legalName: string; // row 20 — English legal name
  streetAddress: string; // row 21 — full address (may be multi-line)
  postCode: string; // row 23
  city: string; // row 25
  country: string; // row 26
  unlocode: string; // row 27 — UN/LOCODE e.g. "IN PNQ"
  latitude: string; // row 28 — e.g. '18°38\'52.23"'
  longitude: string; // row 29

  // Section 2 – Authorized representative
  authorizedRepName: string; // row 30
  email: string; // row 31
  telephone: string; // row 32

  // Section 4a – Aggregated goods category (row 62)
  goodsCategory: string; // e.g. "Iron or steel products"
  productionRoutes: string; // e.g. "All production routes"

  // Section 4b – Production process (row 83)
  processScope: string; // e.g. "Only direct production"
  processName: string; // e.g. "ERW tubes, CEW tubes"

  // Section 5 – Purchased precursor (row 102)
  precursorCountryCode: string; // e.g. "IN"
  precursorName: string; // e.g. "MS STEEL COIL"

  // C_Emissions&Energy – Data quality (section 2c)
  dataQualityApproach: string; // row 40 — e.g. "Mostly measurements & analyses"
  qualityAssuranceApproach: string; // row 42 — e.g. "None"

  // D_Processes – Static selections (section f, j, k)
  measurableHeatApplicable: boolean; // K50 — e.g. false
  wasteGasesApplicable: boolean; // L50 — e.g. false
  electricityEFSource: string; // L67 — e.g. "Mix"

  // E_PurchPrec – Static precursor emission values (from supplier defaults)
  precursorWasteMultiplier: number; // e.g. 1.1 (purchased = sold × multiplier)
  precursorSEEDirect: number; // L49 — tCO2e/t, e.g. 1.89
  precursorSEEDirectSource: string; // M49 — e.g. "Default"
  precursorElecConsumption: number; // L50 — MWh/t, e.g. 0.44
  precursorElecConsumptionSource: string; // M50 — e.g. "Default"
  precursorElecEF: number; // L51 — tCO2e/MWh, e.g. 0.727
  precursorElecEFSource: string; // M51 — e.g. "Mix"
  precursorDefaultJustification: string; // K54–M54 — e.g. "Data gaps"

  // Summary_Products – Static product row values (row 10)
  summaryProcessName: string; // D10 — e.g. "ERW tubes, CEW tubes"
  summaryCNCode: string; // F10 — e.g. "73063012"
  summaryProductName: string; // H10 — e.g. "STAINLESS STEEL"
  summaryReducingAgent: string; // P10 — e.g. "Coal or coke"
  summarySteelMillId: number; // Q10 — e.g. 0
}

// ---- Report Context --------------------------------------------------

/**
 * The shared data bag passed to every SheetFiller.
 *
 * The pipeline builds this once before running fillers. Later fillers
 * may require additional DB data — add those fields here (typed as optional)
 * and populate them in pipeline.ts before the filler registry is run.
 */
export interface ReportContext {
  workbook: ExcelJS.Workbook;
  companySlug: CompanySlug;
  companyProfile: CompanyProfile;
  period: ReportingPeriod;

  // B_EmInst: fuel consumption totals (tonnes) for the quarter
  quarterDieselTonnes?: number;
  quarterLpgTonnes?: number;

  // C_Emissions&Energy: total indirect (scope 2) emissions for the quarter
  quarterIndirectCO2e?: number;

  // Emission constants for the quarter (NCV, EF values from DB or fallback)
  emissionConstants?: MetaEngitechConstants;

  // D_Processes+: customer + material selection (required for complete report)
  customerCode: string;
  materialIds: string[];

  // D_Processes: aggregated data for the selected customer + materials
  dProcesses?: {
    totalQuantityMT: number; // sum of quantity_mt sold to this customer for selected materials
    totalDirectEmissionsCO2e: number; // sum of (scope1_intensity × quantity_mt) per product
    totalElectricityMWh: number; // sum of (scope2_intensity × quantity_mt / electricity_ef_MWh) per product
    electricityEF: number; // emission factor for electricity (tCO2/MWh), e.g. 0.598
  };
}

// ---- Sheet Filler ----------------------------------------------------

/**
 * A SheetFiller writes FILL_IN cells for exactly one sheet.
 * It receives the full ReportContext and mutates ctx.workbook in place.
 *
 * Sync or async — the pipeline awaits each call.
 * If a filler throws, the pipeline aborts entirely (no partial reports).
 */
export type SheetFiller = (ctx: ReportContext) => void | Promise<void>;

export interface FillerRegistration {
  sheetName: string; // exact name as it appears in the Excel file
  filler: SheetFiller;
  description: string; // used in console logs during generation
}

// ---- Pipeline Result -------------------------------------------------

export interface ReportResult {
  buffer: Buffer;
  fileName: string; // e.g. "CBAM_Report_meta_engitech_pune_2025_Q2.xlsx"
  sheetsProcessed: string[];
}
