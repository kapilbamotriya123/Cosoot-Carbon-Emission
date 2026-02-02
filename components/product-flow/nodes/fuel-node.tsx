import { Handle, Position } from "@xyflow/react";
import { Zap, Flame, Droplet } from "lucide-react";
import type { FuelNodeData, FuelKind } from "@/lib/product-flows/types";

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

export function FuelNode({ data }: { data: FuelNodeData }) {
  const config = fuelConfig[data.fuelKind];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border ${config.border} ${config.bg} px-3 py-2 shadow-sm`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${config.iconColor}`} />
      <span className={`text-sm font-medium ${config.text}`}>{data.label}</span>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
    </div>
  );
}
