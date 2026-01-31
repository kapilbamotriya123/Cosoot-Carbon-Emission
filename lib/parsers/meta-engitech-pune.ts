import ExcelJS from "exceljs";
import type { Product, RoutingData, RoutingParser, RoutingRow } from "./types";

/**
 * Parser for Meta Engitech Pune's BOM/routing Excel format.
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
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Assume the routing data is in the first sheet
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded file");
  }

  const products: Product[] = [];

  // Collect rows into groups separated by empty rows.
  // Each group represents one product's manufacturing route.
  let currentGroup: RoutingRow[] = [];
  let currentProductId: string | null = null;

  // Start from row 2 (skip header row)
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const materialType = String(row.getCell(1).value ?? "").trim();
    const materials = String(row.getCell(2).value ?? "").trim();
    const material = String(row.getCell(4).value ?? "").trim();
    const workCenter = String(row.getCell(5).value ?? "").trim();
    const operationShortText = String(row.getCell(6).value ?? "").trim();

    // Empty row = product boundary
    // A row is "empty" if all our relevant columns are blank
    const isEmpty = !materialType && !materials && !material && !workCenter;

    if (isEmpty) {
      // End of a product group — save it if we have data
      if (currentProductId && currentGroup.length > 0) {
        products.push({
          productId: currentProductId,
          rows: currentGroup,
        });
      }
      // Reset for the next group
      currentGroup = [];
      currentProductId = null;
      return;
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
  });

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
