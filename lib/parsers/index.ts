import type { RoutingParser } from "./types";
import { parseMetaEngitechPune } from "./meta-engitech-pune";

// Parser registry: maps company slugs to their specific parsing functions.
//
// When adding a new company:
// 1. Create a new file in lib/parsers/ (e.g., acme-corp.ts)
// 2. Export a parser function matching the RoutingParser type
// 3. Add it to this registry
//
// The slug must match the companyId stored in Clerk user metadata.
const parserRegistry: Record<string, RoutingParser> = {
  meta_engitech_pune: parseMetaEngitechPune,
};

export function getParser(companySlug: string): RoutingParser {
  const parser = parserRegistry[companySlug];
  if (!parser) {
    throw new Error(
      `No parser registered for company: "${companySlug}". ` +
        `Available parsers: ${Object.keys(parserRegistry).join(", ")}`
    );
  }
  return parser;
}

export type { RoutingData, Product, RoutingRow } from "./types";
