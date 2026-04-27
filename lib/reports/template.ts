/**
 * ExcelJS template loading and safe cell-writing utilities.
 *
 * Why these helpers exist:
 *
 * The CBAM template has hundreds of formula cells alongside a smaller
 * number of FILL_IN cells (yellow background). If we accidentally write
 * to a formula cell, the formula is silently replaced and the report
 * breaks. These utilities add a safety warning and make the common
 * pattern of writing the same value across a column range (e.g. I:N)
 * concise.
 */

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs/promises";
import type { CompanySlug } from "@/lib/constants";

const TEMPLATES_DIR = path.join(process.cwd(), "lib", "reports", "templates");

/** Maps company slug to its template file name. */
const TEMPLATE_FILES: Record<CompanySlug, string> = {
  meta_engitech_pune: "Report Sample ALTA - METAENGITECH.xlsx",
  shakambhari: "Report Sample ALTA - shakambhari.xlsx",
};

/**
 * Load the Excel template into an ExcelJS Workbook.
 *
 * Each company has its own template file with pre-filled static data
 * (e.g. different goods categories, process layouts). The pipeline
 * selects the right template based on the company slug.
 *
 * ExcelJS reads the .xlsx file into memory and gives us a mutable object.
 * We write cell values in place, then serialize back to a Buffer.
 * All formula cells are preserved — ExcelJS only changes what we explicitly set.
 */
export async function loadTemplate(companySlug: CompanySlug): Promise<ExcelJS.Workbook> {
  const fileName = TEMPLATE_FILES[companySlug];
  if (!fileName) {
    throw new Error(
      `[reports] No template file configured for company "${companySlug}". ` +
        `Available: [${Object.keys(TEMPLATE_FILES).join(", ")}]`
    );
  }

  const templatePath = path.join(TEMPLATES_DIR, fileName);
  const workbook = new ExcelJS.Workbook();
  const fileBuffer = await fs.readFile(templatePath);
  // ExcelJS.xlsx.load expects an ArrayBuffer; convert the Node.js Buffer.
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  return workbook;
}

/**
 * Get a worksheet by its exact name (as it appears in the Excel tab).
 * Throws if the sheet is not found — better than returning undefined and
 * crashing later with a confusing message.
 */
export function getSheet(
  workbook: ExcelJS.Workbook,
  name: string
): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) {
    const available = workbook.worksheets.map((w) => w.name).join(", ");
    throw new Error(
      `[reports] Sheet "${name}" not found in template. ` +
        `Available sheets: ${available}`
    );
  }
  return sheet;
}

/**
 * Safely set a single cell value.
 *
 * Logs a warning if the cell already contains a formula — this indicates
 * we may have accidentally targeted a formula cell instead of a FILL_IN cell.
 * The write still happens (some cells may have formula defaults), but the
 * warning surfaces the mistake.
 */
export function setCellValue(
  sheet: ExcelJS.Worksheet,
  cellRef: string,
  value: string | number | boolean | Date
): void {
  const cell = sheet.getCell(cellRef);
  const existing = cell.value;

  const hasFormula =
    existing !== null &&
    existing !== undefined &&
    typeof existing === "object" &&
    ("formula" in existing || "sharedFormula" in existing);

  if (hasFormula) {
    console.warn(
      `[reports] WARNING: Overwriting formula cell ${sheet.name}!${cellRef}. ` +
        `Only FILL_IN (yellow) cells should be written.`
    );
  }

  cell.value = value;
}

/**
 * Set the same value across a contiguous column range in a single row.
 *
 * Most FILL_IN fields in A_InstData span columns I through N (the 6 merged
 * display columns), with the same value repeated in every cell. This helper
 * handles that pattern cleanly.
 *
 * Example: setRowRange(sheet, "I", "N", 20, "METAMORPHOSIS ENGITECH...")
 * writes the company name to I20, J20, K20, L20, M20, and N20.
 */
export function setRowRange(
  sheet: ExcelJS.Worksheet,
  startCol: string,
  endCol: string,
  row: number,
  value: string | number | boolean | Date
): void {
  const startNum = columnToNumber(startCol);
  const endNum = columnToNumber(endCol);

  for (let col = startNum; col <= endNum; col++) {
    const colLetter = numberToColumn(col);
    setCellValue(sheet, `${colLetter}${row}`, value);
  }
}

/**
 * Clear a cell's value, but only if it's not a formula cell.
 * Returns true if the cell was cleared, false if it was a formula (left intact).
 */
export function clearCell(
  sheet: ExcelJS.Worksheet,
  cellRef: string
): boolean {
  const cell = sheet.getCell(cellRef);
  const v = cell.value;
  const isFormula =
    v !== null && v !== undefined && typeof v === "object" &&
    ("formula" in v || "sharedFormula" in v);
  if (isFormula) return false;
  cell.value = null;
  return true;
}

// ---- Internal helpers -----------------------------------------------

/**
 * Convert a column letter (e.g. "I", "N", "AA") to a 1-based number.
 * A=1, B=2, ..., Z=26, AA=27, AB=28, ...
 */
function columnToNumber(col: string): number {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64); // A=65, so A→1
  }
  return num;
}

/**
 * Convert a 1-based column number to its letter representation.
 * 1=A, 2=B, ..., 9=I, 14=N, 27=AA, ...
 */
function numberToColumn(col: number): string {
  let letter = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}
