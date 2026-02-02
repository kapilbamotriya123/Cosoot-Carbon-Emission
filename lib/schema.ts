import { pool } from "./db";

// This function creates our tables if they don't exist.
// Called once on app startup or manually via an API route.
//
// Schema design:
// - companies: Links a company slug to its Clerk user ID
// - routing_data: Stores the BOM/routing data per company as JSONB
// - consumption_data: Monthly consumption data per company as JSONB
// - emission_by_process_meta_engitech: Per-work-center emissions (Meta Engitech specific)
// - emission_by_product_meta_engitech: Per-product emissions (Meta Engitech specific)
// - production_data_shakambhari: Daily production + consumption data for Shakambhari
// - emission_results_shakambhari: Per-product per-date emission calculation results

export async function initializeSchema() {
  await pool.query(`
    -- Rename Meta Engitech emission tables to be company-specific
    -- (guarded: only runs if old table names still exist)
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'emission_by_process' AND table_schema = 'public') THEN
        ALTER TABLE emission_by_process RENAME TO emission_by_process_meta_engitech;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'emission_by_product' AND table_schema = 'public') THEN
        ALTER TABLE emission_by_product RENAME TO emission_by_product_meta_engitech;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname = 'idx_emission_by_product_lookup') THEN
        ALTER INDEX idx_emission_by_product_lookup
          RENAME TO idx_emission_by_product_meta_engitech_lookup;
      END IF;
    END $$;

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

    CREATE TABLE IF NOT EXISTS emission_by_process_meta_engitech (
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

    CREATE TABLE IF NOT EXISTS emission_by_product_meta_engitech (
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

    CREATE INDEX IF NOT EXISTS idx_emission_by_product_meta_engitech_lookup
      ON emission_by_product_meta_engitech (company_slug, year, month, total_intensity DESC);

    CREATE TABLE IF NOT EXISTS production_data_shakambhari (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      date DATE NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      work_center TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT,
      order_no TEXT NOT NULL,
      production_version TEXT,
      production_qty NUMERIC NOT NULL DEFAULT 0,
      production_uom TEXT DEFAULT 'TO',
      plant TEXT,
      sources JSONB NOT NULL DEFAULT '[]',
      original_file_url TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug, date, work_center, product_id, order_no)
    );

    CREATE INDEX IF NOT EXISTS idx_prod_shak_lookup
      ON production_data_shakambhari (company_slug, year, month);

    CREATE TABLE IF NOT EXISTS emission_results_shakambhari (
      id SERIAL PRIMARY KEY,
      company_slug TEXT REFERENCES companies(slug) ON DELETE CASCADE,
      date DATE NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      work_center TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT,
      order_no TEXT NOT NULL,
      production_qty NUMERIC NOT NULL DEFAULT 0,
      production_uom TEXT DEFAULT 'TO',

      -- Aggregate emission values (tCO₂e)
      total_input_co2e NUMERIC NOT NULL DEFAULT 0,
      total_output_co2e NUMERIC NOT NULL DEFAULT 0,
      electricity_co2e NUMERIC NOT NULL DEFAULT 0,
      net_scope1_co2e NUMERIC NOT NULL DEFAULT 0,
      net_total_co2e NUMERIC NOT NULL DEFAULT 0,

      -- Per-source calculation detail (array of SourceEmissionResult)
      source_breakdowns JSONB NOT NULL DEFAULT '[]',

      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_slug, date, work_center, product_id, order_no)
    );

    CREATE INDEX IF NOT EXISTS idx_emission_shak_lookup
      ON emission_results_shakambhari (company_slug, year, month);

    CREATE INDEX IF NOT EXISTS idx_emission_shak_net
      ON emission_results_shakambhari (company_slug, year, month, net_total_co2e DESC);
  `);
}
