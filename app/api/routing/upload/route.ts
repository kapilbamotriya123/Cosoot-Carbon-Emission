import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { uploadToGCS, formatUploadDate } from "@/lib/storage";
import { getParser } from "@/lib/parsers";

// POST /api/routing/upload
//
// Expects: multipart/form-data with:
//   - file: The Excel file (.xlsx)
//   - companySlug: Which company this file belongs to (e.g. "meta_engitech_pune")
//
// Flow:
//   1. Validate the request (file exists, company slug provided)
//   2. Upload original file to GCP Cloud Storage (backup)
//   3. Parse the Excel using the company-specific parser
//   4. Upsert the company in the companies table
//   5. Upsert the parsed routing data in the routing_data table

export async function POST(request: NextRequest) {
  try {
    // Ensure tables exist (safe to call multiple times — CREATE TABLE IF NOT EXISTS)
    await initializeSchema();

    // Step 2: Extract file and company slug from the form data
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

    // Convert the File (Web API) to an ArrayBuffer.
    // ArrayBuffer is the web-standard binary type. We convert to Node's Buffer
    // only for GCS upload (which needs it). The parser takes ArrayBuffer directly.
    const arrayBuffer = await file.arrayBuffer();

    // Step 3: Upload original file to GCP Cloud Storage
    const uploadDate = formatUploadDate();
    const gcsPath = `routing/${companySlug}/${uploadDate}_${file.name}`;
    const fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), gcsPath);

    // Step 4: Parse the Excel using the company-specific parser
    const parser = getParser(companySlug);
    const routingData = await parser(arrayBuffer);

    // Step 5: Upsert company record
    // ON CONFLICT: If the company already exists (by slug), update its clerk_user_id.
    // Slug IS the primary key — no separate numeric id needed.
    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET clerk_user_id = $3`,
      [companySlug, companySlug, "anonymous"]
    );

    // Step 6: Upsert routing data
    // ON CONFLICT: If routing data already exists for this company, replace it.
    // This means re-uploading a BOM file overwrites the old one.
    await pool.query(
      `INSERT INTO routing_data (company_slug, data, original_file_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_slug) DO UPDATE SET
         data = $2,
         original_file_url = $3,
         uploaded_at = NOW()`,
      [companySlug, JSON.stringify(routingData), fileUrl]
    );

    // Track the upload in file_uploads
    await pool.query(
      `INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, file_size_bytes, metadata)
       VALUES ($1, 'routing', $2, $3, $4, $5)`,
      [companySlug, uploadDate, fileUrl, file.size, JSON.stringify({ productsFound: routingData.products.length })]
    );

    return NextResponse.json({
      message: "Routing data uploaded and parsed successfully",
      productsFound: routingData.products.length,
      products: routingData.products.map((p) => ({
        productId: p.productId,
        workCenterCount: p.rows.length,
      })),
    });
  } catch (error) {
    console.error("Routing upload failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
