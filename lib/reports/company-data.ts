/**
 * Static company profiles for CBAM report generation.
 *
 * These values are hardcoded because:
 * - We only have 2 companies
 * - This data changes very rarely (legal name, address, contact)
 * - No need for a DB table at this scale
 *
 * When the client count grows to 10+, migrate to a company_profiles table.
 *
 * All values for Meta Engitech were sourced directly from the filled sample
 * report template (Report Sample ALTA.xlsx), verified against the dump output
 * in Report Sample ALTA_A_InstData.txt.
 *
 * NOTE: The template shows the same coordinate string for both latitude and
 * longitude (row 28 and 29 both show '18°38\'52.23"'). The longitude value
 * is WRONG — Pune's longitude is approximately 73°52′E. Flagged for client
 * verification before the first real report is generated.
 */

import type { CompanySlug } from "@/lib/constants";
import type { CompanyProfile } from "./types";

const COMPANY_PROFILES: Record<CompanySlug, CompanyProfile> = {
  meta_engitech_pune: {
    legalName: "METAMORPHOSIS ENGITECH INDIA PVT. LTD",

    // Two factory units — both addresses in one field as seen in the template
    streetAddress:
      "Unit 1: - Gate No. 1261,Sanaswadi Pune Nagar Road,Tal: Shirur,Pune 412208, Maharashtra India\n" +
      "Unit 2: - Gat No. 56/3,4 & 5, Village: Pimple Jagtap,Tal: Shirur, Distt: Pune,Maharashtra-412208,India.",

    postCode: "412208",
    city: "Pune",
    country: "India",
    unlocode: "IN PNQ",

    // TODO: Verify longitude with client — template had '18°38\'52.23"' for
    // both lat and lng, which is incorrect. Pune longitude ≈ 73°52'E.
    latitude: "18°38'52.23\"",
    longitude: "18°38'52.23\"", // PLACEHOLDER — needs client confirmation

    authorizedRepName: "Narendra Singh",
    email: "narendra.singh@metaengitech.com",
    telephone: "9266775836",

    goodsCategory: "Iron or steel products",
    productionRoutes: "All production routes",
    processScope: "Only direct production",
    processName: "ERW tubes, CEW tubes",

    precursorCountryCode: "IN",
    precursorName: "MS STEEL COIL",

    dataQualityApproach: "Mostly measurements & analyses",
    qualityAssuranceApproach: "None",

    measurableHeatApplicable: false,
    wasteGasesApplicable: false,
    electricityEFSource: "Mix",

    precursorWasteMultiplier: 1.1,
    precursorSEEDirect: 1.89,
    precursorSEEDirectSource: "Default",
    precursorElecConsumption: 0.44,
    precursorElecConsumptionSource: "Default",
    precursorElecEF: 0.727,
    precursorElecEFSource: "Mix",
    precursorDefaultJustification: "Data gaps",

    summaryProcessName: "ERW tubes, CEW tubes",
    summaryCNCode: "73063012",
    summaryProductName: "STAINLESS STEEL",
    summaryReducingAgent: "Coal or coke",
    summarySteelMillId: 0,
  },

  shakambhari: {
    legalName: "Shakambhari Ispat and Power Limited",
    streetAddress: "Madandih",
    postCode: "723121",
    city: "Purulia",
    country: "India",
    unlocode: "", // TODO: Confirm UNLOCODE with client
    latitude: "", // TODO: Get coordinates from client
    longitude: "", // TODO: Get coordinates from client
    authorizedRepName: "Mridul Agarwal",
    email: "mridul.agarwal@shakambharigroup.in",
    telephone: "+918373055383",

    goodsCategory: "Alloys (FeMn, FeCr, FeNi)",
    productionRoutes: "All production routes",
    processScope: "Only direct production",
    // processName is dynamic for Shakambhari — populated per-report from materialIds.
    // The filler writes directly from ctx.materialIds instead of using this field.
    processName: "",

    // No purchased precursors for Shakambhari
    precursorCountryCode: "",
    precursorName: "",

    dataQualityApproach: "", // TODO: Confirm with client
    qualityAssuranceApproach: "", // TODO: Confirm with client

    measurableHeatApplicable: false,
    wasteGasesApplicable: false,
    electricityEFSource: "", // TODO: Confirm with client

    // No precursors — all zeros
    precursorWasteMultiplier: 1,
    precursorSEEDirect: 0,
    precursorSEEDirectSource: "",
    precursorElecConsumption: 0,
    precursorElecConsumptionSource: "",
    precursorElecEF: 0,
    precursorElecEFSource: "",
    precursorDefaultJustification: "",

    // Summary_Products is also dynamic for Shakambhari — multiple products per report
    summaryProcessName: "",
    summaryCNCode: "",
    summaryProductName: "",
    summaryReducingAgent: "",
    summarySteelMillId: 0,
  },
};

export function getCompanyProfile(slug: CompanySlug): CompanyProfile {
  const profile = COMPANY_PROFILES[slug];
  if (!profile) {
    throw new Error(`[reports] No company profile found for slug "${slug}"`);
  }
  return profile;
}
