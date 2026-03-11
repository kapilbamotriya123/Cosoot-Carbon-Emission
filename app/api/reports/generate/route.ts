import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
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
// Body (JSON): {
//   companySlug: string,
//   startDate: string,       // ISO date e.g. "2025-04-01"
//   endDate: string,         // ISO date e.g. "2025-06-30"
//   customerCode: string,
//   materialIds: string[],
//   mode?: "combined" | "individual"  // default: "combined"
// }
//
// mode = "combined" (default):
//   Generates ONE report for all materialIds summed together.
//   Response: { success, reports: [{ fileName, downloadUrl, materialIds, sheetsProcessed }] }
//
// mode = "individual":
//   Generates ONE report PER materialId.
//   Response: { success, reports: [{ fileName, downloadUrl, materialIds, sheetsProcessed }, ...] }
//
// Flow:
//   1. Validate inputs
//   2. Determine material groups based on mode
//   3. For each group: generate report → upload to GCS → log in file_uploads
//   4. Return signed download URLs for all reports

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    await initializeSchema();

    const body = await request.json();
    const { companySlug, startDate: startDateStr, endDate: endDateStr, customerCode, materialIds } = body as {
      companySlug: unknown;
      startDate: unknown;
      endDate: unknown;
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

    // -- Validate date range -------------------------------------------

    if (!startDateStr || typeof startDateStr !== "string") {
      return NextResponse.json(
        { error: "startDate is required (ISO format, e.g. \"2025-04-01\")" },
        { status: 400 }
      );
    }

    if (!endDateStr || typeof endDateStr !== "string") {
      return NextResponse.json(
        { error: "endDate is required (ISO format, e.g. \"2025-06-30\")" },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr as string);
    const endDate = new Date(endDateStr as string);

    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: "startDate is not a valid date" },
        { status: 400 }
      );
    }

    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "endDate is not a valid date" },
        { status: 400 }
      );
    }

    if (startDate >= endDate) {
      return NextResponse.json(
        { error: "startDate must be before endDate" },
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

    // -- Determine mode ------------------------------------------------

    const mode = body.mode === "individual" ? "individual" : "combined";

    // Build material groups: combined = one group with all, individual = one group per material
    const materialGroups: string[][] =
      mode === "individual"
        ? validatedMaterialIds.map((id) => [id])
        : [validatedMaterialIds];

    // -- Generate reports ----------------------------------------------

    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [companySlug, companySlug, "anonymous"]
    );

    const reports: Array<{
      fileName: string;
      downloadUrl: string;
      materialIds: string[];
      sheetsProcessed: string[];
    }> = [];

    for (const groupMaterialIds of materialGroups) {
      const result = await generateReport(
        companySlug as CompanySlug,
        startDate,
        endDate,
        validatedCustomerCode,
        groupMaterialIds
      );

      // Upload to GCS
      const uploadDate = formatUploadDate();
      const gcsPath = `reports/${companySlug}/${uploadDate}_${result.fileName}`;
      const fileUrl = await uploadToGCS(result.buffer, gcsPath);

      // Log in file_uploads
      await pool.query(
        `INSERT INTO file_uploads
           (company_slug, upload_type, file_name, file_url, file_size_bytes, metadata)
         VALUES ($1, 'report', $2, $3, $4, $5)`,
        [
          companySlug,
          result.fileName,
          fileUrl,
          result.buffer.length,
          JSON.stringify({
            startDate: startDateStr,
            endDate: endDateStr,
            materialIds: groupMaterialIds,
            sheetsProcessed: result.sheetsProcessed,
            generatedAt: new Date().toISOString(),
          }),
        ]
      );

      const downloadUrl = await getSignedDownloadUrl(fileUrl);

      reports.push({
        fileName: result.fileName,
        downloadUrl,
        materialIds: groupMaterialIds,
        sheetsProcessed: result.sheetsProcessed,
      });
    }

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("[reports] Generation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
