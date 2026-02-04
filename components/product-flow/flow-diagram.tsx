"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
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
  showDetails?: boolean;
}

function FlowDiagramInner({ nodes, edges, showDetails = false }: FlowDiagramProps) {
  // Add showDetails to all fuel and material nodes
  const nodesWithDetails = useMemo(() => {
    return nodes.map((node) => {
      if (node.type === "fuel" || node.type === "material") {
        return {
          ...node,
          data: {
            ...node.data,
            showDetails,
          },
        };
      }
      return node;
    });
  }, [nodes, showDetails]);
  const { getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Calculate bounds for panning constraint based on actual node positions
  const translateExtent = useMemo(() => {
    if (!nodesInitialized || nodes.length === 0) {
      return undefined;
    }

    const currentNodes = getNodes();
    if (currentNodes.length === 0) return undefined;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    currentNodes.forEach((node) => {
      const nodeWidth = node.measured?.width ?? 200;
      const nodeHeight = node.measured?.height ?? 60;

      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    });

    // Add padding around the graph bounds
    const padding = 100;
    return [
      [minX - padding, minY - padding],
      [maxX + padding, maxY + padding],
    ] as [[number, number], [number, number]];
  }, [nodesInitialized, getNodes, nodes.length]);

  return (
    <div style={{ width: "100%", height: "70vh" }}>
      <ReactFlow
        nodes={nodesWithDetails}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        translateExtent={translateExtent}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "workCenter") return "#f97316";
            if (node.type === "fuel") return "#3b82f6";
            return "#9ca3af";
          }}
          nodeStrokeWidth={3}
          zoomable
          pannable
          maskColor="rgb(240, 240, 240, 0.6)"
        />
      </ReactFlow>
    </div>
  );
}

export function FlowDiagram({ nodes, edges, showDetails }: FlowDiagramProps) {
  return (
    <ReactFlowProvider>
      <FlowDiagramInner nodes={nodes} edges={edges} showDetails={showDetails} />
    </ReactFlowProvider>
  );
}
