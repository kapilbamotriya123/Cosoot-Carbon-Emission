"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import { Loader2 } from "lucide-react";

interface SourceDetail {
  compMat: string;
  compName: string;
  co2e: number;
  category: 'input' | 'electricity';
}

interface SourceEmissionsData {
  current: {
    materialsAndFuels: number;
    energy: number;
  };
  previous: {
    materialsAndFuels: number;
    energy: number;
  } | null;
  yoyChange: {
    materialsAndFuels: { percent: number; absolute: number } | null;
    energy: { percent: number; absolute: number } | null;
  };
  breakdown: {
    materialsAndFuels: SourceDetail[];
    energy: SourceDetail[];
  };
}

interface EmissionsBySourceProps {
  company: string;
  year: string;
  period: string;
}

export function EmissionsBySource({ company, year, period }: EmissionsBySourceProps) {
  const [data, setData] = useState<SourceEmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/emissions/by-source?company=${company}&year=${year}&period=${period}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch emissions data");
        }

        const result = await response.json();

        if (!result.hasData) {
          setError("No data available for selected period");
          setData(null);
        } else {
          setData(result.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [company, year, period]);

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

  // Color palettes
  const COLORS = [
    '#f97316', // orange
    '#ef4444', // red
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#10b981', // green
    '#f59e0b', // amber
    '#6366f1', // indigo
    '#94a3b8', // slate (for "Others")
  ];
  const ENERGY_COLOR = '#eab308'; // yellow

  // Check if we have breakdown data
  const hasBreakdown = data.breakdown && (data.breakdown.materialsAndFuels.length > 0 || data.breakdown.energy.length > 0);

  // Prepare chart data - stacked bars if breakdown available, simple bars otherwise
  const chartData = hasBreakdown ? [
    {
      category: "Materials & Fuels",
      ...Object.fromEntries(
        data.breakdown.materialsAndFuels.map(s => [s.compName, s.co2e])
      ),
    },
    {
      category: "Energy (Electricity)",
      ...Object.fromEntries(
        data.breakdown.energy.map(s => [s.compName, s.co2e])
      ),
    },
  ] : [
    { category: "Materials & Fuels", value: data.current.materialsAndFuels },
    { category: "Energy (Electricity)", value: data.current.energy },
  ];

  // Calculate total
  const totalEmissions = data.current.materialsAndFuels + data.current.energy;

  // Format YoY/QoQ change
  const comparisonLabel = period === 'FULL_YEAR' ? 'YOY' : 'QoQ';
  const formatYoY = (change: { percent: number; absolute: number } | null) => {
    if (!change) return "N/A";
    const sign = change.absolute >= 0 ? "+" : "";
    return `${sign}${change.percent}% (${sign}${change.absolute.toFixed(2)} tCO₂e)`;
  };

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Payload<number, string>[]; label?: string }) => {
    if (!active || !payload?.length) return null;

    const validPayload = payload.filter(p => p.value && p.value > 0);
    if (!validPayload.length) return null;

    const total = validPayload.reduce((sum, entry) => sum + (entry.value || 0), 0);

    return (
      <div className="bg-white p-4 border rounded-lg shadow-lg">
        <h3 className="font-semibold mb-2 text-sm">{label}</h3>
        <div className="space-y-1">
          {validPayload.map((entry) => (
            <div key={String(entry.dataKey)} className="flex justify-between gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: entry.fill || entry.color }}
                />
                <span>{String(entry.dataKey)}:</span>
              </div>
              <span className="font-mono font-semibold">
                {(entry.value || 0).toFixed(2)} tCO₂e
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t font-semibold text-sm flex justify-between">
          <span>Total:</span>
          <span className="font-mono">{total.toFixed(2)} tCO₂e</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Emissions by Source</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis label={{ value: "Emissions (tCO₂e)", angle: -90, position: "insideLeft" }} />

            {hasBreakdown ? (
              <>
                {/* Materials & Fuels bars */}
                {data.breakdown.materialsAndFuels.map((source, idx) => (
                  <Bar
                    key={source.compMat}
                    dataKey={source.compName}
                    stackId="materials"
                    fill={COLORS[idx % COLORS.length]}
                    activeBar={false}
                  />
                ))}

                {/* Energy bars */}
                {data.breakdown.energy.map((source) => (
                  <Bar
                    key={source.compMat}
                    dataKey={source.compName}
                    stackId="energy"
                    fill={ENERGY_COLOR}
                    activeBar={false}
                  />
                ))}

                <Tooltip content={<CustomTooltip />} />
              </>
            ) : (
              <>
                <Bar dataKey="value" fill="#f97316" />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e`, "Emissions"]}
                />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Source Wise Emissions</h2>
        <div className="mb-4 text-sm text-muted-foreground">
          Total Emissions: <span className="font-semibold text-foreground">{totalEmissions.toFixed(2)} Metric Tons</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Ranking</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Emissions</TableHead>
              <TableHead className="text-right">{comparisonLabel} Change (%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Sort by emissions descending */}
            {[
              {
                name: "Materials & Fuels",
                emissions: data.current.materialsAndFuels,
                change: data.yoyChange.materialsAndFuels,
              },
              {
                name: "Energy (Electricity)",
                emissions: data.current.energy,
                change: data.yoyChange.energy,
              },
            ]
              .sort((a, b) => b.emissions - a.emissions)
              .map((row, index) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right">{row.emissions.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        row.change && row.change.percent > 0
                          ? "text-red-600"
                          : row.change && row.change.percent < 0
                          ? "text-green-600"
                          : ""
                      }
                    >
                      {formatYoY(row.change)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            {/* Total row */}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell></TableCell>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{totalEmissions.toFixed(2)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
