"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuarterSelector } from "@/components/overview/quarter-selector";
import { ScopeCards } from "@/components/overview/scope-cards";
import {
  EmissionsRankedTable,
  RankedEmission,
} from "@/components/overview/emissions-ranked-table";
import { COMPANIES } from "@/lib/constants";

type ViewType = "process" | "product";

function DashboardContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? COMPANIES[0].slug;

  const [viewType, setViewType] = useState<ViewType>("process");

  // Scope data
  const [scope1, setScope1] = useState(0);
  const [scope2, setScope2] = useState(0);
  const [scopeLoading, setScopeLoading] = useState(false);

  // Process data
  const [processData, setProcessData] = useState<RankedEmission[]>([]);
  const [processLoading, setProcessLoading] = useState(false);

  // Product data
  const [productData, setProductData] = useState<RankedEmission[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  // Track current selection to avoid stale fetches
  const [currentYear, setCurrentYear] = useState<string>("");
  const [currentQuarter, setCurrentQuarter] = useState<string>("");

  const fetchScopeData = useCallback(
    async (year: string, quarter: string) => {
      if (!company) return;
      setScopeLoading(true);
      try {
        const res = await fetch(
          `/api/emissions/by-scope?company=${company}&year=${year}&period=${quarter}`
        );
        if (!res.ok) throw new Error("Failed to fetch scope data");
        const result = await res.json();
        if (result.hasData) {
          setScope1(result.data.current.scope1);
          setScope2(result.data.current.scope2);
        } else {
          setScope1(0);
          setScope2(0);
        }
      } catch {
        setScope1(0);
        setScope2(0);
      } finally {
        setScopeLoading(false);
      }
    },
    [company]
  );

  const fetchProcessData = useCallback(
    async (year: string, quarter: string) => {
      if (!company) return;
      setProcessLoading(true);
      try {
        const res = await fetch(
          `/api/emissions/by-process?company=${company}&year=${year}&period=${quarter}`
        );
        if (!res.ok) throw new Error("Failed to fetch process data");
        const result = await res.json();
        if (result.hasData) {
          setProcessData(
            result.data.map(
              (item: { workCenter: string; description: string; emissions: number }) => ({
                name: item.description
                  ? `${item.workCenter} (${item.description})`
                  : item.workCenter,
                emissions: item.emissions,
                unit: "tCO\u2082e",
              })
            )
          );
        } else {
          setProcessData([]);
        }
      } catch {
        setProcessData([]);
      } finally {
        setProcessLoading(false);
      }
    },
    [company]
  );

  const fetchProductData = useCallback(
    async (year: string, quarter: string) => {
      if (!company) return;
      setProductLoading(true);
      try {
        const res = await fetch(
          `/api/emissions/by-product?company=${company}&year=${year}&period=${quarter}&page=1&pageSize=1000`
        );
        if (!res.ok) throw new Error("Failed to fetch product data");
        const result = await res.json();
        if (result.hasData) {
          setProductData(
            result.data.map(
              (item: { productId: string; productName: string; emissionIntensity: number }) => ({
                name: item.productName || item.productId,
                emissions: item.emissionIntensity,
                unit: "tCO\u2082e/t",
              })
            )
          );
        } else {
          setProductData([]);
        }
      } catch {
        setProductData([]);
      } finally {
        setProductLoading(false);
      }
    },
    [company]
  );

  const handleQuarterSelect = useCallback(
    (year: string, quarter: string) => {
      setCurrentYear(year);
      setCurrentQuarter(quarter);
      // Fetch scope + currently active view
      fetchScopeData(year, quarter);
      if (viewType === "process") {
        fetchProcessData(year, quarter);
      } else {
        fetchProductData(year, quarter);
      }
    },
    [viewType, fetchScopeData, fetchProcessData, fetchProductData]
  );

  function handleViewChange(newView: ViewType) {
    setViewType(newView);
    // Fetch the data for the new view if we have a quarter selected
    if (currentYear && currentQuarter) {
      if (newView === "process") {
        fetchProcessData(currentYear, currentQuarter);
      } else {
        fetchProductData(currentYear, currentQuarter);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Overview</h1>
        <QuarterSelector company={company} onSelect={handleQuarterSelect} />
      </div>

      {/* Scope Cards */}
      <ScopeCards scope1={scope1} scope2={scope2} loading={scopeLoading} />

      {/* Emissions Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Select
            value={viewType}
            onValueChange={(v) => handleViewChange(v as ViewType)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="process">Process Wise Emissions</SelectItem>
              <SelectItem value="product">Product Wise Emissions</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {viewType === "process" ? (
          <EmissionsRankedTable
            data={processData}
            loading={processLoading}
            title="Process Wise Emissions"
          />
        ) : (
          <EmissionsRankedTable
            data={productData}
            loading={productLoading}
            title="Product Wise Emissions"
          />
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
