import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";

// POST /api/setup — Creates database tables if they don't exist.
// Also backfills file_uploads from existing data tables (idempotent).
export async function POST() {
  try {
    await initializeSchema();
    await backfillFileUploads();
    return NextResponse.json({ message: "Schema initialized successfully" });
  } catch (error) {
    console.error("Schema initialization failed:", error);
    return NextResponse.json(
      { error: "Failed to initialize schema" },
      { status: 500 }
    );
  }
}

/**
 * Backfill file_uploads from existing data tables.
 *
 * Files were uploaded to GCS before the file_uploads table existed.
 * This populates the history from original_file_url columns in:
 * - routing_data
 * - consumption_data
 * - production_data_shakambhari
 *
 * Only runs if file_uploads is empty (safe to call multiple times).
 */
async function backfillFileUploads() {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM file_uploads`);
  if (parseInt(rows[0].count, 10) > 0) {
    return; // Already has data, skip backfill
  }

  // Backfill from routing_data
  // Display name uses "DD Mon YYYY" format (e.g. "25 Feb 2026")
  await pool.query(`
    INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, uploaded_at)
    SELECT
      company_slug,
      'routing',
      TO_CHAR(uploaded_at, 'DD Mon YYYY'),
      original_file_url,
      uploaded_at
    FROM routing_data
    WHERE original_file_url IS NOT NULL
  `);

  // Backfill from consumption_data
  await pool.query(`
    INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, year, month, uploaded_at)
    SELECT
      company_slug,
      'consumption',
      TO_CHAR(uploaded_at, 'DD Mon YYYY'),
      original_file_url,
      year,
      month,
      uploaded_at
    FROM consumption_data
    WHERE original_file_url IS NOT NULL
  `);

  // Backfill from production_data_shakambhari
  // Group by original_file_url since one file creates many rows
  await pool.query(`
    INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, year, month, uploaded_at, metadata)
    SELECT
      company_slug,
      'production',
      TO_CHAR(MIN(uploaded_at), 'DD Mon YYYY'),
      original_file_url,
      MIN(year),
      MIN(month),
      MIN(uploaded_at),
      jsonb_build_object(
        'recordCount', COUNT(*),
        'dateRange', jsonb_build_object(
          'from', MIN(date)::text,
          'to', MAX(date)::text
        )
      )
    FROM production_data_shakambhari
    WHERE original_file_url IS NOT NULL
    GROUP BY company_slug, original_file_url
  `);

  console.log("[setup] Backfilled file_uploads from existing data");
}
