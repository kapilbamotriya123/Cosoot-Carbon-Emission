import ExcelJS from "exceljs";
import type { ProductionParser, ProductionRecord, ProductionSource } from "./types";
import { buildColumnMap, resolveColumns, toNumberOrNull, toISODate } from "../utils";

/**
 * Parser for Shakambhari's production + consumption Excel format.
 *
 * Expected layout:
 *   Row 1: Column headers
 *   Row 2+: Data rows
 *
 * Rows are grouped by product (PROD MAT). When PROD MAT is populated, it starts
 * a new product group. Subsequent rows without PROD MAT are component/source rows
 * belonging to the current product.
 *
 * A product header row may also have COMP MAT data (first source on same row).
 */

const EXPECTED_HEADERS = {
  postingDate: "POSTING DATE",
  plant: "PLANT",
  prodMat: "PROD MAT",
  orderNo: "ORDER NO",
  prodVersion: "PRODUCTION VERSION",
  prodMatDesc: "PROD MATDESC",
  prodUom: "PROD UOM",
  workCenter: "WORK CENTER",
  productionQty: "PRODUCTION QTY",
  compMat: "COMP MAT",
  compMatDesc: "COMP MATDESC",
  compUom: "COMP UOM",
  consumedQty: "CONSUMED QTY",
  byproductQty: "BYPRODUCT QTY",
  consumedVal: "CONSUMED VAL",
  byproductVal: "BYPRODUCT VAL",
};

function extractSource(
  row: ExcelJS.Row,
  COL: Record<string, number>
): ProductionSource {
  return {
    compMat: String(row.getCell(COL.compMat).value ?? "").trim(),
    compName: String(row.getCell(COL.compMatDesc).value ?? "").trim(),
    compUom: String(row.getCell(COL.compUom).value ?? "").trim(),
    consumedQty: toNumberOrNull(row.getCell(COL.consumedQty).value) ?? 0,
    byproductQty: toNumberOrNull(row.getCell(COL.byproductQty).value) ?? 0,
    consumedVal: toNumberOrNull(row.getCell(COL.consumedVal).value) ?? 0,
    byproductVal: toNumberOrNull(row.getCell(COL.byproductVal).value) ?? 0,
  };
}

export const parseShakambhari: ProductionParser = async (
  buffer: ArrayBuffer
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  // Build column map from header row (row 1)
  const colMap = buildColumnMap(worksheet.getRow(1));
  const COL = resolveColumns(colMap, EXPECTED_HEADERS);

  const records: ProductionRecord[] = [];
  let currentRecord: ProductionRecord | null = null;

  for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);

    const prodMat = String(row.getCell(COL.prodMat).value ?? "").trim();
    const compMat = String(row.getCell(COL.compMat).value ?? "").trim();

    // Skip completely empty rows
    if (!prodMat && !compMat) continue;

    // --- NEW PRODUCT GROUP ---
    if (prodMat) {
      // Flush previous record
      if (currentRecord) records.push(currentRecord);

      // Parse date
      const dateRaw = row.getCell(COL.postingDate).value;
      const dateISO = toISODate(dateRaw);
      if (!dateISO) {
        throw new Error(
          `Missing or unparseable date in row ${rowNum}. ` +
            `Got: "${dateRaw}"`
        );
      }
      const dateObj = new Date(dateISO);

      currentRecord = {
        date: dateISO,
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
        plant: String(row.getCell(COL.plant).value ?? "").trim(),
        productId: prodMat,
        productName: String(row.getCell(COL.prodMatDesc).value ?? "").trim(),
        orderNo: String(row.getCell(COL.orderNo).value ?? "").trim(),
        productionVersion: String(
          row.getCell(COL.prodVersion).value ?? ""
        ).trim(),
        workCenter: String(row.getCell(COL.workCenter).value ?? "").trim(),
        productionQty:
          toNumberOrNull(row.getCell(COL.productionQty).value) ?? 0,
        productionUom: String(row.getCell(COL.prodUom).value ?? "").trim(),
        sources: [],
      };

      // This row may ALSO have component data (COMP MAT populated)
      if (compMat) {
        currentRecord.sources.push(extractSource(row, COL));
      }
    }
    // --- COMPONENT ROW (source for current product) ---
    else if (compMat && currentRecord) {
      currentRecord.sources.push(extractSource(row, COL));
    }
  }

  // Flush last record
  if (currentRecord) records.push(currentRecord);

  if (records.length === 0) {
    throw new Error(
      "No production records found in the file. Check that the format matches the expected structure."
    );
  }

  return records;
};
