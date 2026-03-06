import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { uploadToGCS, formatUploadDate } from "@/lib/storage";
import { getProductionParser } from "@/lib/parsers/production";
import { triggerShakambhariEmissionCalculation } from "@/lib/emissions/shakambhari/engine";

// POST /api/production/upload
//
// Expects: multipart/form-data with:
//   - file: The Excel file (.xlsx)
//   - companySlug: Which company this file belongs to (e.g. "shakambhari")
//
// No year/month params — dates are extracted from the parsed data.
//
// Flow:
//   1. Validate the request (required fields)
//   2. Upload original file to GCP Cloud Storage (backup)
//   3. Parse the Excel using the company-specific production parser
//   4. Upsert the company in the companies table
//   5. Transaction: delete existing records for affected dates, then insert new ones

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    await initializeSchema();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companySlug = formData.get("companySlug") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!companySlug) {
      return NextResponse.json(
        { error: "No companySlug provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    // Upload original file to GCS
    const uploadDate = formatUploadDate();
    const gcsPath = `production_data/${companySlug}/${uploadDate}_${file.name}`;
    const fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), gcsPath);

    // Parse the Excel using the company-specific production parser
    const parser = getProductionParser(companySlug);
    const records = await parser(arrayBuffer);

    // Upsert company record
    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET clerk_user_id = $3`,
      [companySlug, companySlug, "anonymous"]
    );

    // Transaction: delete-then-insert for affected dates
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Extract unique dates from parsed records
      const uniqueDates = [...new Set(records.map((r) => r.date))];

      await client.query(
        `DELETE FROM production_data_shakambhari
         WHERE company_slug = $1 AND date = ANY($2::date[])`,
        [companySlug, uniqueDates]
      );

      // Build parallel arrays for unnest-based batch INSERT
      const companySlugs: string[] = [];
      const dates: string[] = [];
      const years: number[] = [];
      const months: number[] = [];
      const workCenters: string[] = [];
      const productIds: string[] = [];
      const productNames: string[] = [];
      const orderNos: string[] = [];
      const productionVersions: string[] = [];
      const productionQtys: number[] = [];
      const productionUoms: string[] = [];
      const plants: string[] = [];
      const sourcesJson: string[] = [];
      const fileUrls: string[] = [];

      for (const r of records) {
        companySlugs.push(companySlug);
        dates.push(r.date);
        years.push(r.year);
        months.push(r.month);
        workCenters.push(r.workCenter);
        productIds.push(r.productId);
        productNames.push(r.productName);
        orderNos.push(r.orderNo);
        productionVersions.push(r.productionVersion);
        productionQtys.push(r.productionQty);
        productionUoms.push(r.productionUom);
        plants.push(r.plant);
        sourcesJson.push(JSON.stringify(r.sources));
        fileUrls.push(fileUrl);
      }

      await client.query(
        `INSERT INTO production_data_shakambhari
          (company_slug, date, year, month, work_center, product_id, product_name,
           order_no, production_version, production_qty, production_uom, plant,
           sources, original_file_url)
         SELECT * FROM unnest(
           $1::text[], $2::date[], $3::int[], $4::int[], $5::text[], $6::text[],
           $7::text[], $8::text[], $9::text[], $10::numeric[], $11::text[],
           $12::text[], $13::jsonb[], $14::text[]
         )`,
        [
          companySlugs, dates, years, months, workCenters, productIds,
          productNames, orderNos, productionVersions, productionQtys,
          productionUoms, plants, sourcesJson, fileUrls,
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Build response summary
    const uniqueProductIds = [...new Set(records.map((r) => r.productId))];
    const uniqueWorkCenters = [...new Set(records.map((r) => r.workCenter))];
    const allDates = records.map((r) => r.date).sort();

    // Track the upload in file_uploads
    // Production data spans multiple months — use the earliest date's year/month
    const earliestYear = records.length > 0 ? records[0].year : null;
    const earliestMonth = records.length > 0 ? records[0].month : null;
    await pool.query(
      `INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, file_size_bytes, year, month, metadata)
       VALUES ($1, 'production', $2, $3, $4, $5, $6, $7)`,
      [
        companySlug, uploadDate, fileUrl, file.size, earliestYear, earliestMonth,
        JSON.stringify({
          recordCount: records.length,
          dateRange: { from: allDates[0], to: allDates[allDates.length - 1] },
          productsFound: uniqueProductIds.length,
        }),
      ]
    );

    // Fire-and-forget: calculate emissions for each affected month.
    // A single upload can span multiple months, so trigger each one.
    const uniqueMonths = [
      ...new Set(records.map((r) => `${r.year}-${r.month}`)),
    ];
    for (const ym of uniqueMonths) {
      const [y, m] = ym.split("-").map(Number);
      triggerShakambhariEmissionCalculation(companySlug, y, m).catch((err) => {
        console.error(
          `[shakambhari-emissions] Calculation failed for ${companySlug} ${y}/${m}:`,
          err
        );
      });
    }

    return NextResponse.json({
      message: "Production data uploaded successfully",
      recordCount: records.length,
      dateRange: {
        from: allDates[0],
        to: allDates[allDates.length - 1],
      },
      productsFound: uniqueProductIds,
      workCentersFound: uniqueWorkCenters,
      emissionCalculationTriggered: uniqueMonths.length,
    });
  } catch (error) {
    console.error("Production upload failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
