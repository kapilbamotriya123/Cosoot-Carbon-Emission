import dagre from "dagre";
import type { Product } from "@/lib/parsers/types";
import type { FlowNode, FlowEdge, FuelProfile, FlowNodeType } from "./types";

// Node dimensions used for dagre layout calculation
const NODE_SIZES: Record<FlowNodeType, { width: number; height: number }> = {
  material: { width: 200, height: 50 },
  workCenter: { width: 240, height: 60 },
  fuel: { width: 150, height: 50 },
};

/**
 * Build React Flow nodes + edges for a single product's manufacturing route.
 *
 * The routing rows are sequential manufacturing steps. Each row has:
 *   - materialType: "BOM Comp" (input material), "FG" (finished good), or "" (continuation)
 *   - materials: the input material ID (only set on BOM Comp / FG rows)
 *   - material: the material being processed at this step
 *   - workCenter: the work center code
 *   - operationShortText: human-readable operation name
 *
 * The visual pattern (matching the client's existing platform screenshot):
 *
 *   Material (input)
 *       ↓
 *   WorkCenter ──→ Fuel nodes (electricity, lpg, diesel)
 *       ↓
 *   Material (output / next input)
 *       ↓
 *   WorkCenter ──→ Fuel nodes
 *       ↓
 *   ... continues
 */
export function buildGraph(
  product: Product,
  fuelProfile: FuelProfile
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  function addNode(id: string, type: FlowNodeType, data: FlowNode["data"]) {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, type, position: { x: 0, y: 0 }, data });
  }

  function addEdge(source: string, target: string) {
    const id = `e-${source}-${target}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target });
  }

  // To handle the same work center appearing for different materials,
  // we use a step index to make work center node IDs unique per occurrence.
  let prevWcNodeId: string | null = null;

  for (let i = 0; i < product.rows.length; i++) {
    const row = product.rows[i];
    // Unique per step so the same WC can appear multiple times in the flow
    const wcNodeId = `wc-${i}-${row.workCenter}`;

    // ── 1. Input material node (only for BOM Comp / FG rows) ──
    if (
      (row.materialType === "BOM Comp" || row.materialType === "FG") &&
      row.materials
    ) {
      const matId = `mat-${row.materials}`;
      addNode(matId, "material", { label: row.materials, nodeType: "material" });

      // If there was a previous work center, connect it to this material
      // (the previous WC produced this material)
      if (prevWcNodeId) {
        addEdge(prevWcNodeId, matId);
      }

      // Material enters the work center
      addEdge(matId, wcNodeId);
    } else if (prevWcNodeId) {
      // Continuation row (same material flowing to next work center)
      // Create an intermediate material node between the two WCs
      const interMatId = `mat-step-${i}-${row.material}`;
      addNode(interMatId, "material", {
        label: row.material,
        nodeType: "material",
      });
      addEdge(prevWcNodeId, interMatId);
      addEdge(interMatId, wcNodeId);
    }

    // ── 2. Work center node ──
    addNode(wcNodeId, "workCenter", {
      label: row.operationShortText,
      code: row.workCenter,
      nodeType: "workCenter",
    });

    // ── 3. Fuel nodes (from selected month's fuel profile) ──
    const fuels = fuelProfile.get(row.workCenter);
    if (fuels) {
      if (fuels.electricity) {
        const fuelId = `fuel-${i}-${row.workCenter}-elec`;
        addNode(fuelId, "fuel", {
          label: "Electricity",
          fuelKind: "electricity",
          nodeType: "fuel",
        });
        addEdge(wcNodeId, fuelId);
      }
      if (fuels.lpg) {
        const fuelId = `fuel-${i}-${row.workCenter}-lpg`;
        addNode(fuelId, "fuel", {
          label: "LPG",
          fuelKind: "lpg",
          nodeType: "fuel",
        });
        addEdge(wcNodeId, fuelId);
      }
      if (fuels.diesel) {
        const fuelId = `fuel-${i}-${row.workCenter}-diesel`;
        addNode(fuelId, "fuel", {
          label: "Diesel",
          fuelKind: "diesel",
          nodeType: "fuel",
        });
        addEdge(wcNodeId, fuelId);
      }
    }

    prevWcNodeId = wcNodeId;
  }

  return applyDagreLayout(nodes, edges);
}

/**
 * Use dagre to auto-position nodes in a top-to-bottom layout.
 */
function applyDagreLayout(
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB", // top to bottom
    nodesep: 80, // horizontal gap between siblings
    ranksep: 100, // vertical gap between ranks
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    const size = NODE_SIZES[node.type];
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const size = NODE_SIZES[node.type];
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    };
  });

  return { nodes: layoutNodes, edges };
}

// ── Fuel profile builder ─────────────────────────────────────────

interface ConsumptionWorkCenter {
  totalEnergyKWh?: number | null;
  lpgConsumptionKg?: number | null;
  dieselConsumptionLtrs?: number | null;
  [key: string]: unknown;
}

/**
 * Build fuel flags for each work center from consumption data.
 * Typically called with a single month's data.
 * A fuel is flagged true if the work center has non-null, > 0 usage.
 */
export function buildFuelProfile(
  consumptionRows: Record<string, ConsumptionWorkCenter>[]
): FuelProfile {
  const profile: FuelProfile = new Map();

  for (const monthData of consumptionRows) {
    for (const [wcCode, wc] of Object.entries(monthData)) {
      const existing = profile.get(wcCode) ?? {
        electricity: false,
        lpg: false,
        diesel: false,
      };

      if (wc.totalEnergyKWh != null && wc.totalEnergyKWh > 0) {
        existing.electricity = true;
      }
      if (wc.lpgConsumptionKg != null && wc.lpgConsumptionKg > 0) {
        existing.lpg = true;
      }
      if (wc.dieselConsumptionLtrs != null && wc.dieselConsumptionLtrs > 0) {
        existing.diesel = true;
      }

      profile.set(wcCode, existing);
    }
  }

  return profile;
}
