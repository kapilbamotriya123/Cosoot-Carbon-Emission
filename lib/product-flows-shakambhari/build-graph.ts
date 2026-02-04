import dagre from "dagre";
import type {
  FlowNode,
  FlowEdge,
  ProductionRecord,
  SourceMaterial,
} from "./types";

/**
 * Build React Flow graph for Shakambhari product flows.
 * Structure: Input materials (including Mix Power) → Work center → Main product + Byproducts
 * Mix Power is shown as a fuel node on the left side with other inputs.
 */

const MIX_POWER_ID = "70000002"; // Used to identify Mix Power for fuel node styling

export function buildGraph(record: ProductionRecord): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const nodeIds = new Set<string>();

  function addNode(
    id: string,
    type: "material" | "workCenter" | "fuel",
    data: any
  ) {
    if (!nodeIds.has(id)) {
      nodes.push({
        id,
        type,
        data,
        position: { x: 0, y: 0 }, // Will be set by dagre
      });
      nodeIds.add(id);
    }
  }

  function addEdge(source: string, target: string) {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
    });
  }

  // Parse sources
  const sources = record.sources;

  // Categorize materials
  const inputs: SourceMaterial[] = [];
  const byproducts: SourceMaterial[] = [];

  for (const src of sources) {
    if (src.consumedQty > 0) {
      // All consumed materials (including Mix Power) are inputs
      inputs.push(src);
    } else if (src.byproductQty > 0) {
      byproducts.push(src);
    }
  }

  // ── 1. Input material nodes (left side, including Mix Power) ──
  inputs.forEach((inp, i) => {
    const inputId = `input-${i}-${inp.compMat}`;
    // Use fuel node type for Mix Power (electricity), material for others
    const nodeType = inp.compMat === MIX_POWER_ID ? "fuel" : "material";
    addNode(inputId, nodeType, {
      label: inp.compName,
      nodeType: nodeType,
      ...(nodeType === "fuel" && { fuelKind: "electricity" }),
      // Add consumption and emission data
      consumption: inp.consumedQty,
      consumptionUnit: inp.compUom,
      emission: inp.co2e,
    });
  });

  // ── 2. Work center node (center) ──
  const wcNodeId = `wc-${record.work_center}`;
  addNode(wcNodeId, "workCenter", {
    label: record.work_center,
    code: record.work_center,
    nodeType: "workCenter",
  });

  // Connect all inputs (including Mix Power) to work center
  inputs.forEach((inp, i) => {
    const inputId = `input-${i}-${inp.compMat}`;
    addEdge(inputId, wcNodeId);
  });

  // ── 3. Main product node (right side, top) ──
  const mainProductId = `product-${record.product_id}`;
  // Find main product in sources to get emission data
  const mainProductSource = sources.find((s) => s.compMat === record.product_id);
  addNode(mainProductId, "material", {
    label: record.product_name,
    nodeType: "material",
    consumption: record.production_qty,
    consumptionUnit: record.production_uom,
    emission: mainProductSource?.co2e,
  });
  addEdge(wcNodeId, mainProductId);

  // ── 4. Byproduct nodes (right side, below main product) ──
  byproducts.forEach((bp, i) => {
    const byproductId = `byproduct-${i}-${bp.compMat}`;
    addNode(byproductId, "material", {
      label: bp.compName,
      nodeType: "material",
      consumption: bp.byproductQty,
      consumptionUnit: bp.compUom,
      emission: bp.co2e,
    });
    addEdge(wcNodeId, byproductId);
  });

  return applyDagreLayout(nodes, edges);
}

/**
 * Use dagre to auto-position nodes in a left-to-right layout.
 */
function applyDagreLayout(
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 150 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 200, height: 60 });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positionedNodes = nodes.map((node) => {
    const positioned = g.node(node.id);
    return {
      ...node,
      position: {
        x: positioned.x - 100,
        y: positioned.y - 30,
      },
    };
  });

  return { nodes: positionedNodes, edges };
}
