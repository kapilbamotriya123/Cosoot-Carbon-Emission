"use client";

import { Card } from "@/components/ui/card";
import { Flame, Zap } from "lucide-react";
import { Loader2 } from "lucide-react";

interface ScopeCardsProps {
  scope1: number;
  scope2: number;
  loading: boolean;
}

export function ScopeCards({ scope1, scope2, loading }: ScopeCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i} className="p-6 flex items-center justify-center h-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </Card>
        ))}
      </div>
    );
  }

  const total = scope1 + scope2;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">By Scope</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scope 1 */}
        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Flame className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              Scope 1 (Direct)
            </p>
            <p className="text-xl font-semibold">
              {scope1.toFixed(2)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                tCO₂e
              </span>
            </p>
          </div>
        </Card>

        {/* Scope 2 */}
        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              Scope 2 (Indirect)
            </p>
            <p className="text-xl font-semibold">
              {scope2.toFixed(2)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                tCO₂e
              </span>
            </p>
          </div>
        </Card>
      </div>

      {/* Total */}
      <p className="text-sm text-muted-foreground">
        Total Emissions:{" "}
        <span className="font-semibold text-foreground">
          {total.toFixed(2)} tCO₂e
        </span>
      </p>
    </div>
  );
}
