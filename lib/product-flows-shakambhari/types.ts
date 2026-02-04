/**
 * Types for Shakambhari product flow visualization.
 * Shakambhari flows are simpler: Input materials → Work center → Main product + Byproducts
 */

// Re-export shared types from the main product-flows module
import type {
  FlowNode,
  FlowEdge,
  FlowNodeType,
  FlowNodeData,
  FuelKind,
} from "@/lib/product-flows/types";

export type { FlowNode, FlowEdge, FlowNodeType, FlowNodeData, FuelKind };

// ── Source Material from production_data_shakambhari.sources ──
export interface SourceMaterial {
  compMat: string;
  compUom: string;
  compName: string;
  consumedQty: number;
  consumedVal: number;
  byproductQty: number;
  byproductVal: number;
  co2e?: number; // Emission data (tCO2e) - added from emission_results_shakambhari
}

// ── Production record from database ──
export interface ProductionRecord {
  id: string;
  company_slug: string;
  date: string; // ISO date string
  year: number;
  month: number;
  work_center: string;
  product_id: string;
  product_name: string;
  order_no: string;
  production_version: string;
  production_qty: number;
  production_uom: string;
  plant: string;
  sources: SourceMaterial[];
  original_file_url: string;
  uploaded_at: string;
}

// ── API Response Types ──

export interface AvailableMonth {
  year: number;
  month: number;
}

export interface ProductListItem {
  productId: string;
  productName: string;
}

export interface ProductListResponse {
  products: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductFlowResponse {
  productId: string;
  productName: string;
  workCenter: string;
  date: string; // ISO date string of first occurrence
  productionQty: number; // Total aggregated production quantity
  productionUom: string;
  totalRecords?: number; // Number of production runs aggregated
  nodes: FlowNode[];
  edges: FlowEdge[];
  availableMonths: AvailableMonth[];
  selectedYear: number | null;
  selectedMonth: number | null;
}
