"use client";

import { Handle, Position } from "@xyflow/react";
import { Zap, Flame, Droplet } from "lucide-react";
import type { FuelNodeData, FuelKind } from "@/lib/product-flows/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const fuelConfig: Record<
  FuelKind,
  {
    icon: typeof Zap;
    bg: string;
    border: string;
    text: string;
    iconColor: string;
  }
> = {
  electricity: {
    icon: Zap,
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-700",
    iconColor: "text-yellow-500",
  },
  lpg: {
    icon: Flame,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    iconColor: "text-blue-500",
  },
  diesel: {
    icon: Droplet,
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-700",
    iconColor: "text-gray-500",
  },
};

interface FuelNodeProps {
  data: FuelNodeData & { showDetails?: boolean };
}

export function FuelNode({ data }: FuelNodeProps) {
  const config = fuelConfig[data.fuelKind];
  const Icon = config.icon;

  const hasDetails = data.consumption !== undefined;
  const showDetails = data.showDetails && hasDetails;

  const tooltipContent = hasDetails && (
    <div className="space-y-1">
      <div className="font-semibold">{data.label}</div>
      {data.consumption !== undefined && (
        <div>
          Consumption: {data.consumption.toFixed(2)}{" "}
          {data.consumptionUnit || ""}
        </div>
      )}
      {data.emission !== undefined && (
        <div>Emission: {data.emission.toFixed(3)} tCO₂e</div>
      )}
    </div>
  );

  const nodeContent = (
    <div
      className={`flex items-center gap-2 rounded-lg border ${config.border} ${config.bg} px-3 py-2 shadow-sm ${showDetails ? "flex-col items-start" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${config.iconColor}`} />
        <span className={`text-sm font-medium ${config.text}`}>
          {data.label}
        </span>
      </div>
      {showDetails && hasDetails && (
        <div className={`text-xs ${config.text} space-y-0.5 w-full`}>
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
