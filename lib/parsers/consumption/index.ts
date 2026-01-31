import type { ConsumptionParser } from "./types";
import { parseMetaEngitechPuneConsumption } from "./meta-engitech-pune";

// Consumption parser registry: maps company slugs to their specific parsing functions.
//
// When adding a new company:
// 1. Create a new file in lib/parsers/consumption/ (e.g., acme-corp.ts)
// 2. Export a parser function matching the ConsumptionParser type
// 3. Add it to this registry
const consumptionParserRegistry: Record<string, ConsumptionParser> = {
  meta_engitech_pune: parseMetaEngitechPuneConsumption,
};

export function getConsumptionParser(companySlug: string): ConsumptionParser {
  const parser = consumptionParserRegistry[companySlug];
  if (!parser) {
    throw new Error(
      `No consumption parser registered for company: "${companySlug}". ` +
        `Available parsers: ${Object.keys(consumptionParserRegistry).join(", ")}`
    );
  }
  return parser;
}

export type { ConsumptionData, WorkCenterConsumption } from "./types";
