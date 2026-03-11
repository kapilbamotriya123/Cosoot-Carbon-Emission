import type { SalesParser } from "./types";
import { parseMetaEngitechPuneSales } from "./meta-engitech-pune";
import { parseShakambhariSales } from "./shakambhari";

/**
 * Sales parser registry — maps company slug to its parser function.
 * Add new companies here as they onboard.
 */
const salesParserRegistry: Record<string, SalesParser> = {
  meta_engitech_pune: parseMetaEngitechPuneSales,
  shakambhari: parseShakambhariSales,
};

export function getSalesParser(companySlug: string): SalesParser {
  const parser = salesParserRegistry[companySlug];
  if (!parser) {
    throw new Error(
      `No sales parser registered for company "${companySlug}". ` +
        `Available: [${Object.keys(salesParserRegistry).join(", ")}]`
    );
  }
  return parser;
}
