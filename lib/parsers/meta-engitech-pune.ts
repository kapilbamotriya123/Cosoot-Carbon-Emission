import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { Product, RoutingData, RoutingParser, RoutingRow } from "./types";
import { resolveColumns } from "./utils";

/**
 * Parser for Meta Engitech Pune's BOM/routing Excel format.
 *
 * Uses ExcelJS streaming reader to handle large files (25-30MB) without
 * loading the entire workbook into memory. A 30MB Excel can consume
 * 200-300MB RAM with the non-streaming approach; streaming keeps it flat.
 *
 * Headers are resolved by name (case-insensitive, whitespace-collapsed)
 * so the parser is resilient to column reordering.
 *
 * Products are separated by empty rows. Each product group ends with an "FG"
 * row — the FG row's Material (column D) is the finished product ID.
 */

const EXPECTED_HEADERS = {
  materialType: "Material Type",
  materials: "Materials",
  material: "Material",
  workCenter: "Work Center",
  operationShortText: "Operation Short Text",
};

export const parseMetaEngitechPune: RoutingParser = async (buffer: ArrayBuffer) => {
  const products: Product[] = [];
  let currentGroup: RoutingRow[] = [];
  let currentProductId: string | null = null;

  // Convert ArrayBuffer to a Node.js Readable stream for the streaming reader.
  const stream = new Readable();
  stream.push(Buffer.from(buffer));
  stream.push(null); // signals end of stream

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    worksheets: "emit",
    entries: "emit",
  });

  let worksheetFound = false;
  let COL: Record<string, number> | null = null;

  for await (const worksheet of workbookReader) {
    // Only process the first worksheet
    if (worksheetFound) break;
    worksheetFound = true;

    for await (const row of worksheet) {
      const rowNumber = row.number;

      // Row 1: build column map from header row
      if (rowNumber === 1) {
        // Streaming rows support row.values which returns a sparse array [undefined, val1, val2, ...]
        const headerValues = row.values as (string | undefined)[];
        const colMap: Record<string, number> = {};
        headerValues.forEach((val, idx) => {
          if (val) {
            const name = String(val).trim().replace(/\s+/g, " ").toLowerCase();
            colMap[name] = idx;
          }
        });
        COL = resolveColumns(colMap, EXPECTED_HEADERS);
        continue;
      }

      if (!COL) {
        throw new Error("Header row not found — expected headers in row 1");
      }

      const materialType = String(row.getCell(COL.materialType).value ?? "").trim();
      const materials = String(row.getCell(COL.materials).value ?? "").trim();
      const material = String(row.getCell(COL.material).value ?? "").trim();
      const workCenter = String(row.getCell(COL.workCenter).value ?? "").trim();
      const operationShortText = String(row.getCell(COL.operationShortText).value ?? "").trim();

      // Empty row = product boundary
      const isEmpty = !materialType && !materials && !material && !workCenter;

      if (isEmpty) {
        if (currentProductId && currentGroup.length > 0) {
          products.push({
            productId: currentProductId,
            rows: currentGroup,
          });
        }
        currentGroup = [];
        currentProductId = null;
        continue;
      }

      // Track the FG (finished good) row — its material ID becomes the product ID
      if (materialType === "FG") {
        currentProductId = material;
      }

      currentGroup.push({
        materialType,
        materials,
        material,
        workCenter,
        operationShortText,
      });
    }
  }

  if (!worksheetFound) {
    throw new Error("No worksheet found in the uploaded file");
  }

  // Don't forget the last group (file might not end with an empty row)
  if (currentProductId && currentGroup.length > 0) {
    products.push({
      productId: currentProductId,
      rows: currentGroup,
    });
  }

  if (products.length === 0) {
    throw new Error(
      "No products found in the file. Check that the format matches the expected structure."
    );
  }

  return { products };
};
