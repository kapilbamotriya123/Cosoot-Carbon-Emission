import ExcelJS from "exceljs";
import type { ConsumptionData, ConsumptionParser, WorkCenterConsumption } from "./types";
import { buildColumnMap, resolveColumns, toNumberOrNull, toDateStringDDMMYYYY } from "../utils";

/**
 * Parser for Meta Engitech Pune's monthly consumption Excel format.
 *
 * Expected layout:
 *   Row 1: Title ("CBAM Energy Consumption Data 2025")
 *   Row 2: Sheet name + month selector
 *   Row 3: Column headers
 *   Row 4+: Data rows (one per work center)
 *
 * Headers are resolved by name (case-insensitive, whitespace-collapsed)
 * so the parser is resilient to column reordering.
 *
 * Validation:
 *   - First data row (row 4) sequence column must be 1, otherwise format is incompatible
 *   - Duplicate WorkCenter codes throw an error
 */

const EXPECTED_HEADERS = {
  sequence: "Sequence",
  workCenter: "WorkCenter",
  description: "Description",
  productionMT: "Production in MT",
  uomProduction: "UOM Production",
  totalEnergyKWh: "Total Energy in KWh",
  energyMSEB: "Energy MSEB KWh",
  energySolar: "Energy Solar KWh",
  uomElect: "UOM Elect. Energy",
  lpgKg: "LPG consumption in Kg",
  uomLPG: "UOM LPG",
  dieselLtrs: "Diesel consumption in Ltrs",
  uomDiesel: "UOM Diesel",
  dateValue: "DateVAlue",
};

export const parseMetaEngitechPuneConsumption: ConsumptionParser = async (
  buffer: ArrayBuffer
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  // Build column map from header row (row 3)
  const colMap = buildColumnMap(worksheet.getRow(3));
  const COL = resolveColumns(colMap, EXPECTED_HEADERS, {
    aliases: {
      totalEnergyKWh: ["Energy in KWh"],
      dateValue: ["Date"],
    },
    optional: new Set(["energyMSEB", "energySolar"]),
  });

  // Validate format: first data row (row 4) sequence should be 1
  const firstSequenceCell = worksheet.getRow(4).getCell(COL.sequence).value;
  const firstSequence = Number(firstSequenceCell);
  if (firstSequence !== 1) {
    throw new Error(
      `Data format incompatible: expected sequence 1 in row 4 sequence column, got "${firstSequenceCell}". ` +
        `Make sure the data starts at row 4 with sequence number 1.`
    );
  }

  const data: ConsumptionData = {};

  // Parse from row 4 onwards
  const rowCount = worksheet.rowCount;
  for (let rowNum = 4; rowNum <= rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);

    const sequenceRaw = row.getCell(COL.sequence).value;
    const workCenter = String(row.getCell(COL.workCenter).value ?? "").trim();

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
      description: String(row.getCell(COL.description).value ?? "").trim(),
      productionMT: toNumberOrNull(row.getCell(COL.productionMT).value),
      uomProduction: String(row.getCell(COL.uomProduction).value ?? "").trim(),
      totalEnergyKWh: toNumberOrNull(row.getCell(COL.totalEnergyKWh).value),
      energyMSEBKWh: COL.energyMSEB ? toNumberOrNull(row.getCell(COL.energyMSEB).value) : null,
      energySolarKWh: COL.energySolar ? toNumberOrNull(row.getCell(COL.energySolar).value) : null,
      uomElectEnergy: String(row.getCell(COL.uomElect).value ?? "").trim(),
      lpgConsumptionKg: toNumberOrNull(row.getCell(COL.lpgKg).value),
      uomLPG: String(row.getCell(COL.uomLPG).value ?? "").trim(),
      dieselConsumptionLtrs: toNumberOrNull(row.getCell(COL.dieselLtrs).value),
      uomDiesel: String(row.getCell(COL.uomDiesel).value ?? "").trim(),
      dateValue: toDateStringDDMMYYYY(row.getCell(COL.dateValue).value),
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
