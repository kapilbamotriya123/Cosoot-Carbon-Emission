import ExcelJS from "exceljs";

/**
 * Build a case-insensitive column name → column index map from a header row.
 * Trims whitespace, collapses multiple spaces, and lowercases for resilient matching.
 */
export function buildColumnMap(headerRow: ExcelJS.Row): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value ?? "")
      .trim()
      .replace(/\s+/g, " ") // collapse "Energy  MSEB" → "Energy MSEB"
      .toLowerCase();
    if (name) colMap[name] = colNumber;
  });
  return colMap;
}

/**
 * Given expected header names, resolve them to column indices.
 * Throws if any required headers are missing.
 * Keys in `expected` are field names, values are header text (will be lowercased + space-collapsed).
 */
export function resolveColumns(
  colMap: Record<string, number>,
  expected: Record<string, string>
): Record<string, number> {
  const resolved: Record<string, number> = {};
  const missing: string[] = [];

  for (const [field, headerName] of Object.entries(expected)) {
    const normalized = headerName.trim().replace(/\s+/g, " ").toLowerCase();
    const idx = colMap[normalized];
    if (idx === undefined) {
      missing.push(`${field} (expected: "${headerName}")`);
    } else {
      resolved[field] = idx;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing columns: ${missing.join(", ")}. ` +
        `Found: [${Object.keys(colMap).join(", ")}]`
    );
  }

  return resolved;
}

/**
 * Safely convert an Excel cell value to a number, or null if empty/non-numeric.
 * Handles comma-formatted strings like "2,303,000.00".
 */
export function toNumberOrNull(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  let raw = value;
  if (typeof raw === "string") {
    raw = raw.replace(/,/g, "");
  }
  const num = Number(raw);
  return isNaN(num) ? null : num;
}

/**
 * Convert an Excel date cell to ISO date string (YYYY-MM-DD).
 * Handles: Date objects, "M/DD/YY" strings, "MM/DD/YYYY" strings.
 */
export function toISODate(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  const str = String(value).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return str; // fallback: return as-is
}

/**
 * Convert an Excel date cell to DD-MM-YYYY format (Meta Engitech legacy format).
 */
export function toDateStringDDMMYYYY(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(value).trim();
}
