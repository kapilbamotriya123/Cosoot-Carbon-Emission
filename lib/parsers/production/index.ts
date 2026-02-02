import type { ProductionParser } from "./types";
import { parseShakambhari } from "./shakambhari";

// Production parser registry: maps company slugs to their specific parsing functions.
//
// When adding a new company:
// 1. Create a new file in lib/parsers/production/ (e.g., new-company.ts)
// 2. Export a parser function matching the ProductionParser type
// 3. Add it to this registry
const productionParserRegistry: Record<string, ProductionParser> = {
  shakambhari: parseShakambhari,
};

export function getProductionParser(companySlug: string): ProductionParser {
  const parser = productionParserRegistry[companySlug];
  if (!parser) {
    throw new Error(
      `No production parser registered for company: "${companySlug}". ` +
        `Available parsers: ${Object.keys(productionParserRegistry).join(", ")}`
    );
  }
  return parser;
}

export type { ProductionRecord, ProductionSource, ProductionParser } from "./types";
