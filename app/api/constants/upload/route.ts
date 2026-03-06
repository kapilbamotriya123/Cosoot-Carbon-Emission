import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { pool } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { validateCompany } from "@/lib/analytics/utils";
import { uploadToGCS, formatUploadDate } from "@/lib/storage";

/**
 * POST /api/constants/upload
 *
 * Upload an Excel file with emission constants.
 * Parses the file, validates structure, and upserts into DB.
 *
 * multipart/form-data: file, company, year, quarter
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const company = formData.get("company") as string | null;
    const yearStr = formData.get("year") as string | null;
    const quarterStr = formData.get("quarter") as string | null;

    if (!file || !company || !yearStr || !quarterStr) {
      return NextResponse.json(
        { error: "Missing required fields: file, company, year, quarter" },
        { status: 400 }
      );
    }

    const { isValid } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    const quarter = parseInt(quarterStr, 10);

    if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: "Invalid year or quarter (1-4)" },
        { status: 400 }
      );
    }

    // Read the Excel file
    const arrayBuffer = await file.arrayBuffer();

    // Upload original file to GCS for download history
    const uploadDate = formatUploadDate();
    const gcsPath = `constants/${company}/Q${quarter}-${year}_${uploadDate}_${file.name}`;
    const fileUrl = await uploadToGCS(Buffer.from(arrayBuffer), gcsPath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    let constants: Record<string, unknown>;

    if (company === "meta_engitech_pune") {
      constants = parseMetaEngitechFile(workbook);
    } else {
      constants = parseShakambhariFile(workbook);
    }

    // Upsert into DB
    await pool.query(
      `INSERT INTO emission_constants (company_slug, year, quarter, constants, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (company_slug, year, quarter)
       DO UPDATE SET constants = $4, updated_at = NOW()`,
      [company, year, quarter, JSON.stringify(constants)]
    );

    // Track the upload in file_uploads
    await pool.query(
      `INSERT INTO file_uploads (company_slug, upload_type, file_name, file_url, file_size_bytes, year, quarter, metadata)
       VALUES ($1, 'constants', $2, $3, $4, $5, $6, $7)`,
      [company, uploadDate, fileUrl, file.size, year, quarter, JSON.stringify({ quarter })]
    );

    // Check if emission data exists for this quarter (to prompt recalculation)
    const { isMetaEngitech } = validateCompany(company);
    const dataTable = isMetaEngitech ? "consumption_data" : "production_data_shakambhari";
    const quarterMonths = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
    const existingData = await pool.query(
      `SELECT COUNT(*) FROM ${dataTable}
       WHERE company_slug = $1 AND year = $2 AND month = ANY($3::int[])`,
      [company, year, quarterMonths]
    );
    const hasExistingEmissions = parseInt(existingData.rows[0].count, 10) > 0;

    return NextResponse.json({
      success: true,
      message: `Constants uploaded for Q${quarter} ${year}`,
      constants,
      hasExistingEmissions,
      year,
      quarter,
    });
  } catch (error) {
    console.error("Error uploading constants:", error);
    const message = error instanceof Error ? error.message : "Failed to upload constants";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Parse Meta Engitech constants from Excel.
 * Expects a sheet named "Constants" with columns: Constant, Value, Unit
 */
function parseMetaEngitechFile(workbook: ExcelJS.Workbook): Record<string, unknown> {
  const sheet = workbook.getWorksheet("Constants") || workbook.worksheets[0];
  if (!sheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  const requiredKeys = [
    "electricity_ef",
    "lpg_ncv",
    "lpg_ef",
    "diesel_ncv",
    "diesel_ef",
    "diesel_density",
  ];

  const result: Record<string, number> = {};

  // Skip header row (row 1), read data rows
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const key = String(row.getCell(1).value ?? "").trim().toLowerCase();
    const value = parseFloat(String(row.getCell(2).value ?? ""));

    if (key && !isNaN(value)) {
      result[key] = value;
    }
  });

  // Validate all required keys are present
  const missing = requiredKeys.filter((k) => result[k] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing constants in uploaded file: ${missing.join(", ")}. ` +
      `Expected rows with these constant names: ${requiredKeys.join(", ")}`
    );
  }

  return { type: "meta_engitech", ...result };
}

/**
 * Parse Shakambhari constants from Excel.
 * Expects:
 * - Sheet "General" with columns: Constant, Value, Unit
 * - Sheet "Carbon Content" with columns: Material ID, Material Name, Carbon Content
 */
function parseShakambhariFile(workbook: ExcelJS.Workbook): Record<string, unknown> {
  // Parse general constants
  const generalSheet = workbook.getWorksheet("General") || workbook.worksheets[0];
  if (!generalSheet) {
    throw new Error("No 'General' worksheet found");
  }

  const generalConstants: Record<string, number> = {};
  generalSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const key = String(row.getCell(1).value ?? "").trim().toLowerCase();
    const value = parseFloat(String(row.getCell(2).value ?? ""));
    if (key && !isNaN(value)) {
      generalConstants[key] = value;
    }
  });

  if (generalConstants.electricity_ef === undefined) {
    throw new Error("Missing 'electricity_ef' in General sheet");
  }
  if (generalConstants.co2_per_carbon === undefined) {
    throw new Error("Missing 'co2_per_carbon' in General sheet");
  }

  // Parse carbon content map
  const carbonSheet = workbook.getWorksheet("Carbon Content") || workbook.worksheets[1];
  if (!carbonSheet) {
    throw new Error("No 'Carbon Content' worksheet found");
  }

  const carbonContentMap: Record<string, { compName: string; carbonContent: number }> = {};
  let entryCount = 0;

  carbonSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const materialId = String(row.getCell(1).value ?? "").trim();
    const materialName = String(row.getCell(2).value ?? "").trim();
    const carbonContent = parseFloat(String(row.getCell(3).value ?? ""));

    if (materialId && !isNaN(carbonContent)) {
      carbonContentMap[materialId] = {
        compName: materialName,
        carbonContent,
      };
      entryCount++;
    }
  });

  if (entryCount === 0) {
    throw new Error("No valid entries found in 'Carbon Content' sheet");
  }

  return {
    type: "shakambhari",
    electricity_ef: generalConstants.electricity_ef,
    co2_per_carbon: generalConstants.co2_per_carbon,
    carbon_content_map: carbonContentMap,
  };
}
