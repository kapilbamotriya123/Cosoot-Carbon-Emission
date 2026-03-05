import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import {
  uploadToGCS,
  getSignedDownloadUrl,
  formatUploadDate,
} from "@/lib/storage";
import { generateReport } from "@/lib/reports/pipeline";
import { COMPANIES } from "@/lib/constants";
import type { CompanySlug } from "@/lib/constants";

// POST /api/reports/generate
//
// Body (JSON): { companySlug: string, year: number, quarter: number, customerCode: string, materialIds: string[] }
//
// Response: {
//   success: true,
//   fileName: string,
//   fileUrl: string,     // gs:// URL stored in DB
//   downloadUrl: string, // signed HTTPS URL valid for 15 minutes
//   sheetsProcessed: string[]
// }
//
// Flow:
//   1. Validate inputs
//   2. Run the report generation pipeline
//   3. Upload the generated Excel to GCS
//   4. Log the report in file_uploads (for audit trail)
//   5. Return a signed download URL

export async function POST(request: NextRequest) {
  try {
    await initializeSchema();

    const body = await request.json();
    const { companySlug, year, quarter, customerCode, materialIds } = body as {
      companySlug: unknown;
      year: unknown;
      quarter: unknown;
      customerCode: unknown;
      materialIds: unknown;
    };

    // -- Validate inputs -----------------------------------------------

    if (!companySlug || typeof companySlug !== "string") {
      return NextResponse.json(
        { error: "companySlug is required" },
        { status: 400 }
      );
    }

    const validSlugs = COMPANIES.map((c) => c.slug);
    if (!validSlugs.includes(companySlug as CompanySlug)) {
      return NextResponse.json(
        {
          error: `Invalid companySlug. Must be one of: ${validSlugs.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!year || typeof year !== "number" || !Number.isInteger(year)) {
      return NextResponse.json(
        { error: "year is required and must be an integer" },
        { status: 400 }
      );
    }

    if (
      !quarter ||
      typeof quarter !== "number" ||
      !Number.isInteger(quarter) ||
      quarter < 1 ||
      quarter > 4
    ) {
      return NextResponse.json(
        { error: "quarter is required and must be an integer between 1 and 4" },
        { status: 400 }
      );
    }

    // -- Validate required D_Processes params ----------------------------

    if (!customerCode || typeof customerCode !== "string" || !customerCode.trim()) {
      return NextResponse.json(
        { error: "customerCode is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(materialIds) ||
      materialIds.length === 0 ||
      !materialIds.every((id: unknown) => typeof id === "string" && (id as string).trim())
    ) {
      return NextResponse.json(
        { error: "materialIds is required and must be a non-empty array of strings" },
        { status: 400 }
      );
    }

    const validatedCustomerCode = (customerCode as string).trim();
    const validatedMaterialIds = (materialIds as string[]).map((id) => id.trim());

    // -- Generate the report -------------------------------------------

    const result = await generateReport(
      companySlug as CompanySlug,
      year,
      quarter,
      validatedCustomerCode,
      validatedMaterialIds
    );

    // -- Upload to GCS -------------------------------------------------

    // GCS path pattern: reports/{companySlug}/{date}_{fileName}
    // This mirrors the existing pattern for other upload types.
    const uploadDate = formatUploadDate();
    const gcsPath = `reports/${companySlug}/${uploadDate}_${result.fileName}`;
    const fileUrl = await uploadToGCS(result.buffer, gcsPath);

    // -- Log in file_uploads -------------------------------------------

    // Ensure company record exists (same pattern as other upload routes)
    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [companySlug, companySlug, "anonymous"]
    );

    await pool.query(
      `INSERT INTO file_uploads
         (company_slug, upload_type, file_name, file_url, file_size_bytes, year, quarter, metadata)
       VALUES ($1, 'report', $2, $3, $4, $5, $6, $7)`,
      [
        companySlug,
        result.fileName,
        fileUrl,
        result.buffer.length,
        year,
        quarter,
        JSON.stringify({
          sheetsProcessed: result.sheetsProcessed,
          generatedAt: new Date().toISOString(),
        }),
      ]
    );

    // -- Get signed download URL ---------------------------------------

    // Signed URLs expire in 15 minutes (see lib/storage.ts).
    // The user should download immediately after generation.
    const downloadUrl = await getSignedDownloadUrl(fileUrl);

    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      fileUrl,
      downloadUrl,
      sheetsProcessed: result.sheetsProcessed,
    });
  } catch (error) {
    console.error("[reports] Generation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
