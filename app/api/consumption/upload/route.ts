import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { uploadToGCS } from "@/lib/storage";
import { getConsumptionParser } from "@/lib/parsers/consumption";
import { triggerEmissionCalculation } from "@/lib/emissions/engine";

// POST /api/consumption/upload
//
// Expects: multipart/form-data with:
//   - file: The Excel file (.xlsx)
//   - companySlug: Which company this file belongs to (e.g. "meta_engitech_pune")
//   - year: The year of the consumption data (e.g. 2025)
//   - month: The month of the consumption data (1-12)
//
// Flow:
//   1. Validate the request (required fields)
//   2. Upload original file to GCP Cloud Storage (backup)
//   3. Parse the Excel using the company-specific consumption parser
//   4. Upsert the company in the companies table
//   5. Upsert the parsed consumption data in the consumption_data table

export async function POST(request: NextRequest) {
  try {
    await initializeSchema();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companySlug = formData.get("companySlug") as string | null;
    const yearStr = formData.get("year") as string | null;
    const monthStr = formData.get("month") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!companySlug) {
      return NextResponse.json(
        { error: "No companySlug provided" },
        { status: 400 }
      );
    }
    if (!yearStr || !monthStr) {
      return NextResponse.json(
        { error: "Year and month are required" },
        { status: 400 }
      );
    }

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    // Upload original file to GCS: consumption_data/{companySlug}/{year}_{month}
    const gcsPath = `consumption_data/${companySlug}/${year}_${month}`;
    const fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), gcsPath);

    // Parse the Excel using the company-specific consumption parser
    const parser = getConsumptionParser(companySlug);
    const consumptionData = await parser(arrayBuffer);

    // Upsert company record (same as routing upload)
    await pool.query(
      `INSERT INTO companies (slug, display_name, clerk_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET clerk_user_id = $3`,
      [companySlug, companySlug, "anonymous"]
    );

    // Upsert consumption data for this company + year + month
    // Re-uploading for the same month overwrites the old data
    await pool.query(
      `INSERT INTO consumption_data (company_slug, year, month, data, original_file_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_slug, year, month) DO UPDATE SET
         data = $4,
         original_file_url = $5,
         uploaded_at = NOW()`,
      [companySlug, year, month, JSON.stringify(consumptionData), fileUrl]
    );

    const workCenterCount = Object.keys(consumptionData).length;

    // Fire-and-forget: calculate emissions in background.
    // Don't await — the upload response returns immediately.
    triggerEmissionCalculation(companySlug, year, month).catch((err) => {
      console.error(`[emissions] Calculation failed for ${companySlug} ${year}/${month}:`, err);
    });

    return NextResponse.json({
      message: `Consumption data for ${month}/${year} uploaded successfully`,
      workCentersFound: workCenterCount,
      workCenters: Object.keys(consumptionData),
      emissionCalculationTriggered: true,
    });
  } catch (error) {
    console.error("Consumption upload failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
