import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { pool } from "@/lib/db";
import { getDefaultConstants } from "@/lib/emissions/constants-loader";
import { validateCompany } from "@/lib/analytics/utils";
import type { MetaEngitechConstants, ShakambhariConstants } from "@/lib/emissions/constants-loader";

/**
 * GET /api/constants/template?company=X&year=Y&quarter=Q
 *
 * Download an Excel template pre-filled with current constants.
 * Admin can modify values in the file and re-upload via /api/constants/upload.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const company = searchParams.get("company");
    const yearStr = searchParams.get("year");
    const quarterStr = searchParams.get("quarter");

    if (!company || !yearStr || !quarterStr) {
      return NextResponse.json(
        { error: "Missing required params: company, year, quarter" },
        { status: 400 }
      );
    }

    const { isValid } = validateCompany(company);
    if (!isValid) {
      return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    const quarter = parseInt(quarterStr, 10);

    // Load current constants (DB or hardcoded fallback)
    const dbResult = await pool.query(
      `SELECT constants FROM emission_constants
       WHERE company_slug = $1
         AND (year < $2 OR (year = $2 AND quarter <= $3))
       ORDER BY year DESC, quarter DESC
       LIMIT 1`,
      [company, year, quarter]
    );

    const constants = dbResult.rows.length > 0
      ? dbResult.rows[0].constants
      : getDefaultConstants(company);

    // Generate the Excel file
    const workbook = new ExcelJS.Workbook();
    const companyLabel = company === "meta_engitech_pune" ? "Meta Engitech" : "Shakambhari";

    if (company === "meta_engitech_pune") {
      buildMetaEngitechTemplate(workbook, constants as MetaEngitechConstants);
    } else {
      buildShakambhariTemplate(workbook, constants as ShakambhariConstants);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `${companyLabel.replace(/\s+/g, "_")}_constants_Q${quarter}_${year}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating constants template:", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}

function buildMetaEngitechTemplate(
  workbook: ExcelJS.Workbook,
  constants: MetaEngitechConstants
) {
  const sheet = workbook.addWorksheet("Constants");

  // Header row
  sheet.columns = [
    { header: "Constant", key: "constant", width: 25 },
    { header: "Value", key: "value", width: 15 },
    { header: "Unit", key: "unit", width: 15 },
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  // Data rows
  const rows = [
    { constant: "electricity_ef", value: constants.electricity_ef, unit: "tCO2/kWh" },
    { constant: "lpg_ncv", value: constants.lpg_ncv, unit: "MJ/kg" },
    { constant: "lpg_ef", value: constants.lpg_ef, unit: "kg CO2/GJ" },
    { constant: "diesel_ncv", value: constants.diesel_ncv, unit: "MJ/kg" },
    { constant: "diesel_ef", value: constants.diesel_ef, unit: "kg CO2/GJ" },
    { constant: "diesel_density", value: constants.diesel_density, unit: "kg/L" },
  ];

  for (const row of rows) {
    sheet.addRow(row);
  }
}

function buildShakambhariTemplate(
  workbook: ExcelJS.Workbook,
  constants: ShakambhariConstants
) {
  // Sheet 1: General constants
  const generalSheet = workbook.addWorksheet("General");
  generalSheet.columns = [
    { header: "Constant", key: "constant", width: 25 },
    { header: "Value", key: "value", width: 15 },
    { header: "Unit", key: "unit", width: 15 },
  ];

  const generalHeader = generalSheet.getRow(1);
  generalHeader.font = { bold: true };
  generalHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  generalSheet.addRow({ constant: "electricity_ef", value: constants.electricity_ef, unit: "tCO2/kWh" });
  generalSheet.addRow({ constant: "co2_per_carbon", value: constants.co2_per_carbon, unit: "ratio" });

  // Sheet 2: Carbon Content Map
  const carbonSheet = workbook.addWorksheet("Carbon Content");
  carbonSheet.columns = [
    { header: "Material ID", key: "materialId", width: 15 },
    { header: "Material Name", key: "materialName", width: 45 },
    { header: "Carbon Content", key: "carbonContent", width: 18 },
  ];

  const carbonHeader = carbonSheet.getRow(1);
  carbonHeader.font = { bold: true };
  carbonHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  for (const [materialId, entry] of Object.entries(constants.carbon_content_map)) {
    carbonSheet.addRow({
      materialId,
      materialName: entry.compName,
      carbonContent: entry.carbonContent,
    });
  }
}
