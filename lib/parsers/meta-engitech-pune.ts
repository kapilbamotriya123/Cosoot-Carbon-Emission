import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { Product, RoutingData, RoutingParser, RoutingRow } from "./types";

/**
 * Parser for Meta Engitech Pune's BOM/routing Excel format.
 *
 * Uses ExcelJS streaming reader to handle large files (25-30MB) without
 * loading the entire workbook into memory. A 30MB Excel can consume
 * 200-300MB RAM with the non-streaming approach; streaming keeps it flat.
 *
 * Expected columns:
 *   A: Material Type ("BOM Comp" or "FG")
 *   B: Materials (material ID)
 *   C: Plant (not used)
 *   D: Material (material ID, used for product identification)
 *   E: Work Center
 *   F: Operation Short Text
 *
 * Products are separated by empty rows. Each product group ends with an "FG"
 * row — the FG row's Material (column D) is the finished product ID.
 *
 * Example:
 *   Row 2: BOM Comp | SLS3530142501 | 1100 | SLS3530142501 | WSLT1  | Big Slitter-2
 *   Row 3: BOM Comp | S353001F      | 1100 | S353001F      | WTM2   | Tube Mill-2
 *   ...
 *   Row 7: FG       | TS3530300...  | 1150 | TS3530300...  | QWKC   | Quality Inspection
 *   Row 8: (empty)
 *   Row 9: BOM Comp | ... (next product starts)
 */
export const parseMetaEngitechPune: RoutingParser = async (buffer: ArrayBuffer) => {
  const products: Product[] = [];
  let currentGroup: RoutingRow[] = [];
  let currentProductId: string | null = null;

  // Convert ArrayBuffer to a Node.js Readable stream for the streaming reader.
  // This avoids ExcelJS loading the entire buffer into its own internal model.
  const stream = new Readable();
  stream.push(Buffer.from(buffer));
  stream.push(null); // signals end of stream

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    // "emit" means worksheets/rows are streamed as events, not held in memory
    worksheets: "emit",
    entries: "emit",
  });

  let worksheetFound = false;

  for await (const worksheet of workbookReader) {
    // Only process the first worksheet
    if (worksheetFound) break;
    worksheetFound = true;

    for await (const row of worksheet) {
      const rowNumber = row.number;
      if (rowNumber === 1) continue; // skip header

      const materialType = String(row.getCell(1).value ?? "").trim();
      const materials = String(row.getCell(2).value ?? "").trim();
      const material = String(row.getCell(4).value ?? "").trim();
      const workCenter = String(row.getCell(5).value ?? "").trim();
      const operationShortText = String(row.getCell(6).value ?? "").trim();

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
