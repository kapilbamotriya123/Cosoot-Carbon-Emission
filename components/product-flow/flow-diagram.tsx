"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MaterialNode } from "./nodes/material-node";
import { WorkCenterNode } from "./nodes/work-center-node";
import { FuelNode } from "./nodes/fuel-node";
import type { FlowNode, FlowEdge } from "@/lib/product-flows/types";

const nodeTypes = {
  material: MaterialNode,
  workCenter: WorkCenterNode,
  fuel: FuelNode,
};

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function FlowDiagram({ nodes, edges }: FlowDiagramProps) {
  return (
    <ReactFlowProvider>
      <div style={{ width: "100%", height: "70vh" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === "workCenter") return "#f97316";
              if (node.type === "fuel") return "#3b82f6";
              return "#9ca3af";
            }}
            zoomable
            pannable
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
