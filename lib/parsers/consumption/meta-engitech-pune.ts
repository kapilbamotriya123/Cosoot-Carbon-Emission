import ExcelJS from "exceljs";
import type { ConsumptionData, ConsumptionParser, WorkCenterConsumption } from "./types";

/**
 * Parser for Meta Engitech Pune's monthly consumption Excel format.
 *
 * Expected layout:
 *   Row 1: Title ("CBAM Energy Consumption Data 2025")
 *   Row 2: Sheet name + month selector
 *   Row 3: Column headers
 *   Row 4+: Data rows (one per work center)
 *
 * Columns:
 *   A: Sequence (1, 2, 3...)
 *   B: WorkCenter code (e.g. "WSLT1") — used as the key in the output
 *   C: Description
 *   D: Production in MT
 *   E: UOM Production
 *   F: Total Energy in KWh
 *   G: Energy MSEB KWh
 *   H: Energy Solar KWh
 *   I: UOM Elect. Energy
 *   J: LPG consumption in Kg
 *   K: UOM LPG
 *   L: Diesel consumption in Ltrs
 *   M: UOM Diesel
 *   N: DateValue
 *
 * Validation:
 *   - Cell A4 must be 1 (first sequence number), otherwise format is incompatible
 *   - Duplicate WorkCenter codes throw an error
 */
export const parseMetaEngitechPuneConsumption: ConsumptionParser = async (
  buffer: ArrayBuffer
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  // Validate format: cell A4 should be 1 (first sequence number)
  const firstSequenceCell = worksheet.getRow(4).getCell(1).value;
  const firstSequence = Number(firstSequenceCell);
  if (firstSequence !== 1) {
    throw new Error(
      `Data format incompatible: expected sequence 1 in cell A4, got "${firstSequenceCell}". ` +
        `Make sure the data starts at row 4 with sequence number 1.`
    );
  }

  const data: ConsumptionData = {};

  // Parse from row 4 onwards
  const rowCount = worksheet.rowCount;
  for (let rowNum = 4; rowNum <= rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);

    const sequenceRaw = row.getCell(1).value;
    const workCenter = String(row.getCell(2).value ?? "").trim();

    // Stop when we hit an empty row (no sequence and no work center)
    if (sequenceRaw == null && !workCenter) break;
    if (!workCenter) continue; // skip rows without a work center code

    // Check for duplicate work center codes
    if (data[workCenter]) {
      throw new Error(
        `Duplicate WorkCenter "${workCenter}" found at row ${rowNum}. ` +
          `Each work center should appear only once per monthly upload.`
      );
    }

    const entry: WorkCenterConsumption = {
      sequence: Number(sequenceRaw) || 0,
      description: String(row.getCell(3).value ?? "").trim(),
      productionMT: toNumberOrNull(row.getCell(4).value),
      uomProduction: String(row.getCell(5).value ?? "").trim(),
      totalEnergyKWh: toNumberOrNull(row.getCell(6).value),
      energyMSEBKWh: toNumberOrNull(row.getCell(7).value),
      energySolarKWh: toNumberOrNull(row.getCell(8).value),
      uomElectEnergy: String(row.getCell(9).value ?? "").trim(),
      lpgConsumptionKg: toNumberOrNull(row.getCell(10).value),
      uomLPG: String(row.getCell(11).value ?? "").trim(),
      dieselConsumptionLtrs: toNumberOrNull(row.getCell(12).value),
      uomDiesel: String(row.getCell(13).value ?? "").trim(),
      dateValue: toDateString(row.getCell(14).value),
    };

    data[workCenter] = entry;
  }

  if (Object.keys(data).length === 0) {
    throw new Error(
      "No work center data found in the file. Check that the format matches the expected structure."
    );
  }

  return data;
};

/**
 * Safely convert an Excel cell value to a number, or null if empty/non-numeric.
 * ExcelJS can return numbers, strings, or null depending on the cell format.
 */
function toNumberOrNull(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * Convert an Excel date cell to a string.
 * ExcelJS returns Date objects for date-formatted cells, or strings/numbers otherwise.
 */
function toDateString(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    // Format as DD-MM-YYYY to match the Excel display format
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(value).trim();
}
