// Represents one row in a product's routing — a single manufacturing step
export interface RoutingRow {
  materialType: string; // "BOM Comp" or "FG" (finished good)
  materials: string; // Material ID from column B
  material: string; // Material ID from column D (often same as B for BOM rows)
  workCenter: string; // e.g. "WSLT1", "WTM2", "IDFINR"
  operationShortText: string; // Human-readable name like "Big Slitter-2 (U-1)"
}

// A finished product and all its manufacturing steps (work centers it passes through)
export interface Product {
  productId: string; // The FG material ID, e.g. "TS35303000001F"
  rows: RoutingRow[];
}

// The complete parsed output — what gets stored as JSONB in the database
export interface RoutingData {
  products: Product[];
}

// Every company parser must implement this function signature.
// Takes an Excel file as an ArrayBuffer, returns structured routing data.
export type RoutingParser = (buffer: ArrayBuffer) => Promise<RoutingData>;
