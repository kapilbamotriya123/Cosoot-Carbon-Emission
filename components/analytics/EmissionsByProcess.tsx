"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, Search, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 500;

interface ProcessEmission {
  workCenter: string;
  description: string;
  emissions: number;
  yoyChange: { percent: number; absolute: number } | null;
}

interface ProcessEmissionsData {
  data: ProcessEmission[];
  totalEmissions: number;
}

interface EmissionsByProcessProps {
  company: string;
  year: string;
  period: string;
  viewLabel?: "process" | "asset";
}

export function EmissionsByProcess({ company, year, period, viewLabel = "process" }: EmissionsByProcessProps) {
  const isAssetView = viewLabel === "asset";
  const [data, setData] = useState<ProcessEmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isDebouncing = searchInput !== debouncedSearch;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ company, year, period });
        const trimmed = debouncedSearch.trim();
        if (trimmed) params.set("search", trimmed);

        const response = await fetch(`/api/emissions/by-process?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to fetch emissions data");
        }

        const result = await response.json();

        if (!result.hasData) {
          setError(
            trimmed
              ? `No ${isAssetView ? "assets" : "processes"} found matching "${trimmed}"`
              : "No data available for selected period"
          );
          setData(null);
        } else {
          setData({
            data: result.data,
            totalEmissions: result.totalEmissions,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [company, year, period, debouncedSearch, isAssetView]);

  const searchBar = (
    <div className="mb-4 relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={
          isAssetView
            ? "Search by work center or description..."
            : "Search by process or work center..."
        }
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="pl-9 pr-9"
      />
      {isDebouncing || (loading && debouncedSearch.trim()) ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : searchInput ? (
        <button
          type="button"
          onClick={() => setSearchInput("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  // Initial load (no data yet)
  if (loading && !data) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // No data — empty/error state, but keep search bar reachable
  if (!data) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isAssetView ? "Asset Wise Emissions" : "Process Wise Emissions"}
        </h2>
        {searchBar}
        <div className="text-center py-8 text-muted-foreground">
          {error || "No data available"}
        </div>
      </Card>
    );
  }

  // Prepare chart data (top 10)
  const chartData = data.data.slice(0, 10).map((item) => ({
    name: isAssetView ? item.workCenter : (item.description || item.workCenter),
    emissions: item.emissions,
  }));

  // Format YoY/QoQ change
  const comparisonLabel = period === 'FULL_YEAR' ? 'YOY' : 'QoQ';
  const formatYoY = (change: { percent: number; absolute: number } | null) => {
    if (!change) return "N/A";
    const sign = change.absolute >= 0 ? "+" : "";
    return `${sign}${change.percent}% (${sign}${change.absolute.toFixed(2)} tCO₂e)`;
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{isAssetView ? "Emissions by Asset" : "Emissions by Process"}</h2>
        <p className="text-sm text-muted-foreground mb-4">{isAssetView ? "Top 10 assets by emissions" : "Top 10 processes by emissions"}</p>
        <ResponsiveContainer width="100%" height={Math.max(350, chartData.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={200}
              tick={{ fontSize: 12 }}
              interval={0}
            />
            <XAxis
              type="number"
              label={{ value: "Emissions (tCO₂e)", position: "insideBottom", offset: -5 }}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e`, "Emissions"]}
            />
            <Bar dataKey="emissions" fill="#f97316" barSize={24} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{isAssetView ? "Asset Wise Emissions" : "Process Wise Emissions"}</h2>
        {searchBar}
        <div className="mb-4 text-sm text-muted-foreground">
          Total Emissions: <span className="font-semibold text-foreground">{data.totalEmissions.toFixed(2)} Metric Tons</span>
        </div>
        <div className={`overflow-auto max-h-[600px] transition-opacity ${loading ? "opacity-50" : ""}`}>
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[80px]">Ranking</TableHead>
                {isAssetView ? (
                  <>
                    <TableHead>Work Center</TableHead>
                    <TableHead>Description</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Process</TableHead>
                    <TableHead>Work Center</TableHead>
                  </>
                )}
                <TableHead className="text-right">Emissions</TableHead>
                <TableHead className="text-right">{comparisonLabel} Change (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row, index) => (
                <TableRow key={row.workCenter}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  {isAssetView ? (
                    <>
                      <TableCell className="font-mono">{row.workCenter}</TableCell>
                      <TableCell className="text-muted-foreground">{row.description || "—"}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{row.description || row.workCenter}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{row.workCenter}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right">{row.emissions.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        row.yoyChange && row.yoyChange.percent > 0
                          ? "text-red-600"
                          : row.yoyChange && row.yoyChange.percent < 0
                          ? "text-green-600"
                          : ""
                      }
                    >
                      {formatYoY(row.yoyChange)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
