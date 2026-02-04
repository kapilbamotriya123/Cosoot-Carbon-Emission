"use client";

import { Handle, Position } from "@xyflow/react";
import { Cog } from "lucide-react";
import type { MaterialNodeData } from "@/lib/product-flows/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MaterialNodeProps {
  data: MaterialNodeData & { showDetails?: boolean };
}

export function MaterialNode({ data }: MaterialNodeProps) {
  const hasDetails =
    data.consumption !== undefined || data.emission !== undefined;
  const showDetails = data.showDetails && hasDetails;

  const tooltipContent = hasDetails && (
    <div className="space-y-1">
      <div className="font-semibold">{data.label}</div>
      {data.consumption !== undefined && (
        <div>
          Quantity: {data.consumption.toFixed(2)} {data.consumptionUnit || ""}
        </div>
      )}
      {data.emission !== undefined && (
        <div>Emission: {data.emission.toFixed(3)} tCO₂e</div>
      )}
    </div>
  );

  const nodeContent = (
    <div
      className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm ${showDetails ? "flex-col items-start" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Cog className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">{data.label}</span>
      </div>
      {showDetails && hasDetails && (
        <div className="text-xs text-gray-600 space-y-0.5 w-full">
          {data.consumption !== undefined && (
            <div>
              {data.consumption.toFixed(2)} {data.consumptionUnit || ""}
            </div>
          )}
          {data.emission !== undefined && (
            <div>{data.emission.toFixed(3)} tCO₂e</div>
          )}
        </div>
      )}
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400"
      />
    </div>
  );

  if (!hasDetails) {
    return nodeContent;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{nodeContent}</TooltipTrigger>
      <TooltipContent side="right">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
