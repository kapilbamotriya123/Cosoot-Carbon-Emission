import { Handle, Position } from "@xyflow/react";
import { Cog } from "lucide-react";
import type { WorkCenterNodeData } from "@/lib/product-flows/types";

export function WorkCenterNode({ data }: { data: WorkCenterNodeData }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 shadow-sm">
      <Cog className="h-4 w-4 shrink-0 text-orange-500" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-orange-800">{data.label}</div>
        <div className="text-xs text-orange-500">{data.code}</div>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-400"
      />
    </div>
  );
}
