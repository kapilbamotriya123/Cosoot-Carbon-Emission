"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight } from "lucide-react";

interface ProductEmission {
  productId: string;
  productName: string;
  emissionIntensity: number;
  directEmission: number;
  indirectEmission: number;
  yoyChange: { percent: number; absolute: number } | null;
}

interface ProductEmissionsData {
  data: ProductEmission[];
  avgIntensity: number;
  totalProducts: number;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

interface EmissionsByProductProps {
  company: string;
  year: string;
  period: string;
}

export function EmissionsByProduct({ company, year, period }: EmissionsByProductProps) {
  const [data, setData] = useState<ProductEmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/emissions/by-product?company=${company}&year=${year}&period=${period}&page=${page}&pageSize=${pageSize}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch emissions data");
        }

        const result = await response.json();

        if (!result.hasData) {
          setError("No data available for selected period");
          setData(null);
        } else {
          setData({
            data: result.data,
            avgIntensity: result.avgIntensity,
            totalProducts: result.totalProducts,
            pagination: result.pagination,
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
  }, [company, year, period, page, pageSize]);

  const toggleRow = (productId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedRows(newExpanded);
  };

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8">
        <div className="text-center text-muted-foreground">
          {error || "No data available"}
        </div>
      </Card>
    );
  }

  // Prepare chart data (products on current page)
  const chartData = data.data.map((item) => ({
    name: item.productName || item.productId,
    emissions: item.emissionIntensity,
  }));

  // Format YoY/QoQ change
  const comparisonLabel = period === 'FULL_YEAR' ? 'YoY' : 'QoQ';
  const formatYoY = (change: { percent: number; absolute: number } | null) => {
    if (!change) return "N/A";
    const sign = change.absolute >= 0 ? "+" : "";
    return `${sign}${change.percent}% (${sign}${change.absolute.toFixed(2)} tCO₂e/t)`;
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Emissions by Product</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Page {page} of {data.pagination.totalPages} ({data.pagination.totalItems} total products)
        </p>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" height={60} />
            <YAxis label={{ value: "Emission Intensity (tCO₂e/t)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e/t`, "Intensity"]}
            />
            <Bar dataKey="emissions" fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.pagination.totalItems)} of {data.pagination.totalItems} products
            </div>
            <div className="flex items-center gap-1.5">
              {[10, 20, 30].map((size) => (
                <Button
                  key={size}
                  variant={pageSize === size ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-9 text-xs"
                  onClick={() => {
                    setPageSize(size);
                    setPage(1);
                  }}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
          {data.pagination.totalPages > 1 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center px-3 text-sm">
                Page {page} of {data.pagination.totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page === data.pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(data.pagination.totalPages)}
                disabled={page === data.pagination.totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Product Wise Emissions</h2>
        <div className="mb-4 text-sm text-muted-foreground">
          Avg. Emission Intensity: <span className="font-semibold text-foreground">{data.avgIntensity.toFixed(2)} tCO₂e/t</span>
          {" | "}
          Total Products: <span className="font-semibold text-foreground">{data.totalProducts}</span>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="w-[80px]">Ranking</TableHead>
                <TableHead>Product ID</TableHead>
                {data.data[0]?.productName && <TableHead>Product Name</TableHead>}
                <TableHead className="text-right">Emissions (tCO₂e/t)</TableHead>
                <TableHead className="text-right">{comparisonLabel} Change (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row, index) => {
                const isExpanded = expandedRows.has(row.productId);
                const globalRank = (page - 1) * pageSize + index + 1;

                return (
                  <>
                    <TableRow key={row.productId} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(row.productId)}>
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{globalRank}</TableCell>
                      <TableCell className="font-mono">{row.productId}</TableCell>
                      {row.productName && <TableCell>{row.productName}</TableCell>}
                      <TableCell className="text-right font-semibold">{row.emissionIntensity.toFixed(2)}</TableCell>
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
                    {/* Expanded row showing breakdown */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 border-b">
                        <TableCell colSpan={row.productName ? 6 : 5}>
                          <div className="py-3 px-4">
                            <div className="flex flex-col gap-2 text-sm max-w-xs">
                              <div className="flex items-center justify-between rounded-md bg-orange-50 dark:bg-orange-950/30 px-3 py-2 border border-orange-200 dark:border-orange-800">
                                <span className="text-muted-foreground">Scope 1 (Direct)</span>
                                <span className="font-semibold text-orange-700 dark:text-orange-400">{row.directEmission.toFixed(2)} tCO₂e/t</span>
                              </div>
                              <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 border border-blue-200 dark:border-blue-800">
                                <span className="text-muted-foreground">Scope 2 (Indirect)</span>
                                <span className="font-semibold text-blue-700 dark:text-blue-400">{row.indirectEmission.toFixed(2)} tCO₂e/t</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
