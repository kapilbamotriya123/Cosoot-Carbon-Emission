import { Handle, Position } from "@xyflow/react";
import { Cog } from "lucide-react";
import type { MaterialNodeData } from "@/lib/product-flows/types";

export function MaterialNode({ data }: { data: MaterialNodeData }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm">
      <Cog className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="text-sm font-medium text-gray-700">{data.label}</span>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400"
      />
    </div>
  );
}
