/**
 * Clean dump: for each sheet, show only "interesting" cells:
 *  - Cells with actual data values (not empty, not formulas)
 *  - Cells with formulas (abbreviated — just show the formula and result)
 *  - Highlight fill-in cells (YELLOW fill = FFFFFF00 or FFFFFFCC)
 *
 * Output is grouped by section, one line per cell.
 * Usage: node scripts/dump-excel-clean.mjs "lib/reports/templates/Report Sample ALTA.xlsx" [sheetName]
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "fs";

const filePath = process.argv[2];
const filterSheet = process.argv[3]; // optional: dump only this sheet
if (!filePath) {
  console.error('Usage: node scripts/dump-excel-clean.mjs "lib/reports/templates/Report Sample ALTA.xlsx" [sheetName]');
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const lines = [];

const YELLOW_FILLS = new Set(["FFFFFF00", "FFFFFFCC"]); // bright yellow, light yellow

function isYellowFill(cell) {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern") return false;
  const argb = fill.fgColor?.argb;
  return argb && YELLOW_FILLS.has(argb);
}

function cellValueStr(val) {
  if (val === null || val === undefined) return null; // skip empties
  if (typeof val === "object" && val !== null) {
    if (val.formula) {
      const r = val.result !== undefined && val.result !== null ? val.result : "?";
      return `FORMULA: =${val.formula} → ${r}`;
    }
    if (val.sharedFormula) {
      const r = val.result !== undefined && val.result !== null ? val.result : "?";
      return `SHARED_FORMULA → ${r}`;
    }
    if (val.richText) {
      return val.richText.map((rt) => rt.text).join("");
    }
    if (val instanceof Date) {
      return `DATE: ${val.toISOString().split("T")[0]}`;
    }
    return JSON.stringify(val);
  }
  return String(val);
}

function columnToLetter(col) {
  let letter = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

for (const sheet of workbook.worksheets) {
  if (filterSheet && sheet.name !== filterSheet) continue;

  lines.push(`\n${"=".repeat(80)}`);
  lines.push(`SHEET: "${sheet.name}" (${sheet.rowCount} rows × ${sheet.columnCount} cols)`);
  lines.push(`${"=".repeat(80)}`);

  // Track cells we've already output (for merged cells — skip duplicates)
  const seen = new Set();

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const rowCells = [];

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const ref = `${columnToLetter(colNumber)}${rowNumber}`;

      // Skip columns P onwards (these are hidden/helper columns)
      if (colNumber >= 16) return;

      const val = cell.value;
      const str = cellValueStr(val);
      if (!str) return;

      const yellow = isYellowFill(cell);
      const tag = yellow ? " ⬅ FILL_IN" : "";

      rowCells.push(`  ${ref}: ${str}${tag}`);
    });

    if (rowCells.length > 0) {
      lines.push(`--- Row ${rowNumber} ---`);
      lines.push(rowCells.join("\n"));
    }
  });
}

const output = lines.join("\n");
const suffix = filterSheet ? `_${filterSheet}` : "_CLEAN";
const outPath = filePath.replace(/\.xlsx$/, `${suffix}.txt`);
writeFileSync(outPath, output, "utf-8");
console.log(`Dumped to: ${outPath}`);
console.log(`Lines: ${output.split("\n").length}`);
