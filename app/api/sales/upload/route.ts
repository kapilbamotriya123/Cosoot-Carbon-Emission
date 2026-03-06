import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { uploadToGCS, formatUploadDate } from "@/lib/storage";
import { getSalesParser } from "@/lib/parsers/sales";

// POST /api/sales/upload
//
// Expects: multipart/form-data with:
//   - file: The Excel file (.xlsx)
//   - companySlug: Which company this file belongs to (e.g. "meta_engitech_pune")
//
// The month/year is extracted from the data itself (the "Month" column, e.g. "Jan-25").
// A single file can contain data for multiple months.
//
// Upsert strategy: DELETE existing rows for (company, year, month) combos
// found in the file, then INSERT all new rows. Wrapped in a transaction.

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

    // 1. Upload original file to GCS
    const uploadDate = formatUploadDate();
    const gcsPath = `sales_data/${companySlug}/${uploadDate}_${file.name}`;
    const fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), gcsPath);

    // 2. Parse the Excel
    const parser = getSalesParser(companySlug);
    const records = await parser(arrayBuffer);

    // 3. Upsert company record
    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET clerk_user_id = $3`,
      [companySlug, companySlug, "anonymous"]
    );

    // 4. Determine which (year, month) combos are in this file
    const periodSet = new Set<string>();
    for (const r of records) {
      periodSet.add(`${r.year}-${r.month}`);
    }
    const periods = Array.from(periodSet).map((p) => {
      const [y, m] = p.split("-");
      return { year: parseInt(y), month: parseInt(m) };
    });

    // 5. Transaction: delete existing rows for affected periods, then bulk insert
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Delete existing rows for all affected (year, month) combinations
      for (const period of periods) {
        await client.query(
          `DELETE FROM sales_data
           WHERE company_slug = $1 AND year = $2 AND month = $3`,
          [companySlug, period.year, period.month]
        );
      }

      // Bulk insert using unnest for efficiency
      if (records.length > 0) {
        const companySlugs: string[] = [];
        const years: number[] = [];
        const months: number[] = [];
        const customerCodes: string[] = [];
        const materialIds: string[] = [];
        const quantities: number[] = [];
        const fileUrls: string[] = [];

        for (const r of records) {
          companySlugs.push(companySlug);
          years.push(r.year);
          months.push(r.month);
          customerCodes.push(r.customerCode);
          materialIds.push(r.materialId);
          quantities.push(r.quantityMT);
          fileUrls.push(fileUrl);
        }

        await client.query(
          `INSERT INTO sales_data (company_slug, year, month, customer_code, material_id, quantity_mt, original_file_url)
           SELECT * FROM unnest(
             $1::text[], $2::int[], $3::int[], $4::text[], $5::text[], $6::numeric[], $7::text[]
           )`,
          [companySlugs, years, months, customerCodes, materialIds, quantities, fileUrls]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // 6. Track the upload in file_uploads
    // Use the first period for the file_uploads record (or null if mixed)
    const firstPeriod = periods[0];
    await pool.query(
      `INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, file_size_bytes, year, month, metadata)
       VALUES ($1, 'sales', $2, $3, $4, $5, $6, $7)`,
      [
        companySlug,
        uploadDate,
        fileUrl,
        file.size,
        firstPeriod?.year ?? null,
        firstPeriod?.month ?? null,
        JSON.stringify({
          recordCount: records.length,
          periods: periods.map((p) => `${p.month}/${p.year}`),
          uniqueCustomers: new Set(records.map((r) => r.customerCode)).size,
          uniqueMaterials: new Set(records.map((r) => r.materialId)).size,
        }),
      ]
    );

    return NextResponse.json({
      success: true,
      message: `Sales data uploaded successfully`,
      recordCount: records.length,
      periods: periods.map((p) => `${p.month}/${p.year}`),
      uniqueCustomers: new Set(records.map((r) => r.customerCode)).size,
      uniqueMaterials: new Set(records.map((r) => r.materialId)).size,
    });
  } catch (error) {
    console.error("Sales upload failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
