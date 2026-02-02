/**
 * Shared constants used across the application.
 * Company list, roles, and other app-wide config.
 */

export const COMPANIES = [
  { slug: "meta_engitech_pune", label: "Meta Engitech Pune" },
  { slug: "shakambhari", label: "Shakambhari" },
] as const;

export type CompanySlug = (typeof COMPANIES)[number]["slug"];
