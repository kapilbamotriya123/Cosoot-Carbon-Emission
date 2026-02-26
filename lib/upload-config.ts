/**
 * Company-aware upload tab configuration.
 *
 * Each company has a different set of data types it needs to upload.
 * This config determines which tabs appear on the Data Upload page.
 *
 * To add a new company: add an entry to COMPANY_UPLOAD_TABS.
 * If a company isn't listed, DEFAULT_TABS is used.
 */

export type UploadTab = "routing" | "consumption" | "constants" | "sales";

export interface UploadTabConfig {
  key: UploadTab;
  label: string;
}

const TAB_LABELS: Record<UploadTab, string> = {
  routing: "Routing (BOM)",
  consumption: "Consumption Data",
  constants: "Emission Constants",
  sales: "Sales",
};

const COMPANY_UPLOAD_TABS: Record<string, UploadTab[]> = {
  meta_engitech_pune: ["routing", "consumption", "constants", "sales"],
  shakambhari: ["consumption", "constants", "sales"],
};

const DEFAULT_TABS: UploadTab[] = ["consumption", "constants", "sales"];

export function getUploadTabs(company: string): UploadTabConfig[] {
  const tabs = COMPANY_UPLOAD_TABS[company] ?? DEFAULT_TABS;
  return tabs.map((key) => ({ key, label: TAB_LABELS[key] }));
}
