/**
 * Dump an Excel template to a readable text format.
 * Shows: sheet names, cell values, formulas, merged ranges, column widths.
 * Usage: node scripts/dump-excel-template.mjs "lib/reports/templates/Report Sample ALTA.xlsx"
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/dump-excel-template.mjs <file.xlsx>");
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const lines = [];

lines.push(`=== EXCEL TEMPLATE DUMP ===`);
lines.push(`File: ${filePath}`);
lines.push(`Sheets: ${workbook.worksheets.map((ws) => ws.name).join(", ")}`);
lines.push("");

for (const sheet of workbook.worksheets) {
  lines.push(`${"=".repeat(80)}`);
  lines.push(`SHEET: "${sheet.name}"`);
  lines.push(`Rows: ${sheet.rowCount}, Columns: ${sheet.columnCount}`);
  lines.push(`${"=".repeat(80)}`);

  // Merged ranges
  const merges = sheet.model.merges || [];
  if (merges.length > 0) {
    lines.push(`\nMerged Ranges (${merges.length}):`);
    for (const m of merges) {
      lines.push(`  ${m}`);
    }
  }

  lines.push("");

  // Iterate rows
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colLetter = columnToLetter(colNumber);
      const ref = `${colLetter}${rowNumber}`;

      let valueStr = "";
      const val = cell.value;

      if (val === null || val === undefined) {
        valueStr = "(empty)";
      } else if (typeof val === "object" && val !== null) {
        if (val.formula) {
          // Formula cell
          const resultStr =
            val.result !== undefined && val.result !== null
              ? ` → ${val.result}`
              : "";
          valueStr = `[FORMULA: =${val.formula}${resultStr}]`;
        } else if (val.sharedFormula) {
          const resultStr =
            val.result !== undefined && val.result !== null
              ? ` → ${val.result}`
              : "";
          valueStr = `[SHARED_FORMULA: ref=${val.sharedFormula}${resultStr}]`;
        } else if (val.richText) {
          valueStr = val.richText.map((rt) => rt.text).join("");
        } else if (val instanceof Date) {
          valueStr = `[DATE: ${val.toISOString()}]`;
        } else {
          valueStr = JSON.stringify(val);
        }
      } else {
        valueStr = String(val);
      }

      // Check for fill/background color (to identify "fill-in" fields)
      const fill = cell.fill;
      let fillNote = "";
      if (fill && fill.type === "pattern" && fill.fgColor) {
        const argb = fill.fgColor.argb || fill.fgColor.theme;
        if (argb) fillNote = ` [FILL:${argb}]`;
      }

      cells.push(`${ref}=${valueStr}${fillNote}`);
    });

    if (cells.length > 0) {
      lines.push(`Row ${rowNumber}: ${cells.join(" | ")}`);
    }
  });

  lines.push("");
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

const output = lines.join("\n");
const outPath = filePath.replace(/\.xlsx$/, "_DUMP.txt");
writeFileSync(outPath, output, "utf-8");
console.log(`Dumped to: ${outPath}`);
console.log(`Lines: ${lines.length}`);
