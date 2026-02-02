// ── Node data types ──────────────────────────────────────────────

export type FlowNodeType = "material" | "workCenter" | "fuel";
export type FuelKind = "electricity" | "lpg" | "diesel";

export interface MaterialNodeData {
  label: string; // material ID like "SLS3530142501"
  nodeType: "material";
  [key: string]: unknown;
}

export interface WorkCenterNodeData {
  label: string; // operationShortText like "Big Slitter-2 (U-1)"
  code: string; // workCenter code like "WSLT1"
  nodeType: "workCenter";
  [key: string]: unknown;
}

export interface FuelNodeData {
  label: string; // "Electricity", "LPG", or "Diesel"
  fuelKind: FuelKind;
  nodeType: "fuel";
  [key: string]: unknown;
}

export type FlowNodeData = MaterialNodeData | WorkCenterNodeData | FuelNodeData;

// ── React Flow–compatible shapes ─────────────────────────────────

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

// ── API responses ────────────────────────────────────────────────

export interface ProductListItem {
  productId: string;
  workCenterCount: number;
}

export interface ProductListResponse {
  products: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AvailableMonth {
  year: number;
  month: number;
}

export interface ProductFlowResponse {
  productId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  availableMonths: AvailableMonth[];
  selectedYear: number | null;
  selectedMonth: number | null;
}

// ── Fuel profile (aggregated across all months) ──────────────────

export interface FuelFlags {
  electricity: boolean;
  lpg: boolean;
  diesel: boolean;
}

export type FuelProfile = Map<string, FuelFlags>;
