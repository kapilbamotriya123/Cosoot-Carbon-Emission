import { pool } from "./db";

// This function creates our tables if they don't exist.
// Called once on app startup or manually via an API route.
//
// Schema design:
// - companies: Links a company slug to its Clerk user ID
// - routing_data: Stores the BOM/routing data per company as JSONB
//
// The JSONB structure for routing_data.data will look like:
// {
//   "products": [
//     {
//       "productId": "TS35303000001F",
//       "rows": [
//         {
//           "materialType": "BOM Comp",
//           "materials": "SLS3530142501",
//           "material": "SLS3530142501",
//           "workCenter": "WSLT1",
//           "operationShortText": "Big Slitter-2 (U-1)"
//         },
//         ...
//       ]
//     }
//   ]
// }

export async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      slug TEXT PRIMARY KEY,
      clerk_user_id TEXT,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS routing_data (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      data JSONB NOT NULL,
      original_file_url TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug)
    );

    CREATE TABLE IF NOT EXISTS consumption_data (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      data JSONB NOT NULL,
      original_file_url TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug, year, month)
    );

    CREATE TABLE IF NOT EXISTS emission_by_process (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      work_center TEXT NOT NULL,
      description TEXT,
      production_mt NUMERIC,
      electricity_intensity NUMERIC NOT NULL DEFAULT 0,
      lpg_intensity NUMERIC NOT NULL DEFAULT 0,
      diesel_intensity NUMERIC NOT NULL DEFAULT 0,
      total_intensity NUMERIC NOT NULL DEFAULT 0,
      scope1_intensity NUMERIC NOT NULL DEFAULT 0,
      scope2_intensity NUMERIC NOT NULL DEFAULT 0,
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug, year, month, work_center)
    );

    CREATE TABLE IF NOT EXISTS emission_by_product (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      work_center_count INTEGER NOT NULL DEFAULT 0,
      matched_work_center_count INTEGER NOT NULL DEFAULT 0,
      electricity_intensity NUMERIC NOT NULL DEFAULT 0,
      lpg_intensity NUMERIC NOT NULL DEFAULT 0,
      diesel_intensity NUMERIC NOT NULL DEFAULT 0,
      total_intensity NUMERIC NOT NULL DEFAULT 0,
      scope1_intensity NUMERIC NOT NULL DEFAULT 0,
      scope2_intensity NUMERIC NOT NULL DEFAULT 0,
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug, year, month, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_emission_by_product_lookup
      ON emission_by_product (company_slug, year, month, total_intensity DESC);
  `);
}
