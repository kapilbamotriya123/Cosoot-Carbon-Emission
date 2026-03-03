"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { EmissionsByScope } from "@/components/analytics/EmissionsByScope";
import { EmissionsBySource } from "@/components/analytics/EmissionsBySource";
import { EmissionsByProcess } from "@/components/analytics/EmissionsByProcess";
import { EmissionsByProduct } from "@/components/analytics/EmissionsByProduct";

type ViewType = "scope" | "source" | "process" | "product" | "asset";

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  const [view, setView] = useState<ViewType>("scope");
  const [year, setYear] = useState<string>("2025");
  const [period, setPeriod] = useState<string>("FULL_YEAR");

  // Get company display name
  const companyName =
    company === "meta_engitech_pune"
      ? "Meta Engitech"
      : company === "shakambhari"
      ? "Shakambhari"
      : "Select a company";

  // If no company selected, show message
  if (!company) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Please select a company from the top bar to view emission analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">{companyName}</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          {/* View selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">View</label>
            <Select value={view} onValueChange={(v) => setView(v as ViewType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scope">Emissions by Scope</SelectItem>
                <SelectItem value="source">Emissions by Source</SelectItem>
                <SelectItem value="process">Emissions by Process</SelectItem>
                <SelectItem value="asset">Emissions by Asset</SelectItem>
                <SelectItem value="product">Emissions by Product</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year selector */}
          <div className="w-[150px]">
            <label className="text-sm font-medium mb-2 block">Year</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period selector */}
          <div className="w-[150px]">
            <label className="text-sm font-medium mb-2 block">Period</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_YEAR">Full Year</SelectItem>
                <SelectItem value="Q1">Q1</SelectItem>
                <SelectItem value="Q2">Q2</SelectItem>
                <SelectItem value="Q3">Q3</SelectItem>
                <SelectItem value="Q4">Q4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Dynamic view based on selection */}
      {view === "scope" && (
        <EmissionsByScope company={company} year={year} period={period} />
      )}
      {view === "source" && (
        <EmissionsBySource company={company} year={year} period={period} />
      )}
      {view === "process" && (
        <EmissionsByProcess company={company} year={year} period={period} />
      )}
      {view === "asset" && (
        <EmissionsByProcess company={company} year={year} period={period} viewLabel="asset" />
      )}
      {view === "product" && (
        <EmissionsByProduct company={company} year={year} period={period} />
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsContent />
    </Suspense>
  );
}
