"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlowDiagram } from "@/components/product-flow/flow-diagram";
import type {
  ProductFlowResponse,
  AvailableMonth,
} from "@/lib/product-flows-shakambhari/types";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthLabel(m: AvailableMonth): string {
  return `${MONTH_NAMES[m.month]} ${m.year}`;
}

function monthKey(m: AvailableMonth): string {
  return `${m.year}-${m.month}`;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ProductFlowShakambhariContent() {
  const params = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? "shakambhari";
  const productId = decodeURIComponent(params.productId);

  const [data, setData] = useState<ProductFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Month selection — null means "use API default (latest)"
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(
    null
  );
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);

  const fetchFlow = useCallback(
    async (yearOverride?: number, monthOverride?: number) => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/product-flows-shakambhari/${encodeURIComponent(productId)}?companySlug=${company}`;
        if (yearOverride !== undefined && monthOverride !== undefined) {
          url += `&year=${yearOverride}&month=${monthOverride}`;
        }
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json: ProductFlowResponse = await res.json();
        setData(json);

        // Set available months from first response
        if (json.availableMonths.length > 0) {
          setAvailableMonths(json.availableMonths);
        }

        // Set the selected month key from API response (so dropdown shows the right value)
        if (json.selectedYear && json.selectedMonth) {
          setSelectedMonthKey(`${json.selectedYear}-${json.selectedMonth}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [productId, company]
  );

  // Initial fetch (no month specified = API defaults to latest)
  useEffect(() => {
    fetchFlow();
  }, [fetchFlow]);

  function handleMonthChange(key: string) {
    setSelectedMonthKey(key);
    const [y, m] = key.split("-").map(Number);
    fetchFlow(y, m);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={`/dashboard/product-flows-shakambhari?company=${company}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Product Flow - Shakambhari</h1>
            {data && (
              <div className="space-y-1 mt-1">
                <p className="font-mono text-sm text-muted-foreground">
                  {data.productId} - {data.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Work Center: {data.workCenter} | Production Date:{" "}
                  {formatDate(data.date)} | Quantity: {data.productionQty}{" "}
                  {data.productionUom}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Month/Year selector */}
        {availableMonths.length > 0 && (
          <Select
            value={selectedMonthKey ?? undefined}
            onValueChange={handleMonthChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={monthKey(m)} value={monthKey(m)}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="flex items-center justify-center"
          style={{ height: "70vh" }}
        >
          <div className="text-center space-y-3">
            <Skeleton className="mx-auto h-8 w-48" />
            <p className="text-sm text-muted-foreground">
              Loading product flow...
            </p>
          </div>
        </div>
      )}

      {/* Flow diagram */}
      {!loading && data && (
        <FlowDiagram nodes={data.nodes} edges={data.edges} />
      )}

      {/* Empty state */}
      {!loading && !error && data && data.nodes.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">
            No production data found for this product.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ProductFlowShakambhariPage() {
  return (
    <Suspense>
      <ProductFlowShakambhariContent />
    </Suspense>
  );
}
