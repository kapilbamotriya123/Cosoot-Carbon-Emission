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
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
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

  // Color palettes for treemap
  const MATERIAL_COLORS = [
    '#f97316', // orange
    '#ef4444', // red
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#10b981', // green
    '#f59e0b', // amber
    '#6366f1', // indigo
    '#94a3b8', // slate (for "Others")
  ];
  const ENERGY_COLOR = '#3b82f6'; // blue

  // Check if we have breakdown data
  const hasBreakdown = data.breakdown && (data.breakdown.materialsAndFuels.length > 0 || data.breakdown.energy.length > 0);

  // Calculate total
  const totalEmissions = data.current.materialsAndFuels + data.current.energy;

  // Prepare treemap data
  const treemapData: Array<{ name: string; value: number; fill: string }> = [];

  if (hasBreakdown) {
    data.breakdown.materialsAndFuels.forEach((source, idx) => {
      if (source.co2e > 0) {
        treemapData.push({
          name: source.compName,
          value: source.co2e,
          fill: MATERIAL_COLORS[idx % MATERIAL_COLORS.length],
        });
      }
    });
    data.breakdown.energy.forEach((source) => {
      if (source.co2e > 0) {
        treemapData.push({
          name: source.compName,
          value: source.co2e,
          fill: ENERGY_COLOR,
        });
      }
    });
  } else {
    if (data.current.materialsAndFuels > 0) {
      treemapData.push({
        name: "Materials & Fuels",
        value: data.current.materialsAndFuels,
        fill: MATERIAL_COLORS[0],
      });
    }
    if (data.current.energy > 0) {
      treemapData.push({
        name: "Energy (Electricity)",
        value: data.current.energy,
        fill: ENERGY_COLOR,
      });
    }
  }

  // Format YoY/QoQ change
  const comparisonLabel = period === 'FULL_YEAR' ? 'YOY' : 'QoQ';
  const formatYoY = (change: { percent: number; absolute: number } | null) => {
    if (!change) return "N/A";
    const sign = change.absolute >= 0 ? "+" : "";
    return `${sign}${change.percent}% (${sign}${change.absolute.toFixed(2)} tCO₂e)`;
  };

  // Custom content renderer for Treemap rectangles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, value, fill } = props;
    const showName = width > 60 && height > 35;
    const showValue = width > 50 && height > 50;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: fill || '#f97316',
            stroke: '#fff',
            strokeWidth: 2,
          }}
        />
        {showName && (
          <text
            x={x + width / 2}
            y={y + height / 2 - (showValue ? 8 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: '#fff', fontSize: Math.min(12, width / 8), fontWeight: 500 }}
          >
            {name}
          </text>
        )}
        {showValue && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 12}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: 'rgba(255,255,255,0.85)', fontSize: Math.min(11, width / 10) }}
          >
            {Number(value).toFixed(2)} tCO₂e
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-6">
      {/* Treemap Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-2">Emissions by Source</h2>
        <div className="flex gap-4 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MATERIAL_COLORS[0] }} />
            <span>Materials & Fuels</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ENERGY_COLOR }} />
            <span>Energy</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <Treemap
            data={treemapData}
            dataKey="value"
            nameKey="name"
            content={<CustomTreemapContent />}
            isAnimationActive={false}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-background p-3 border rounded-lg shadow-lg text-sm">
                    <div className="font-semibold">{item.name}</div>
                    <div className="font-mono mt-1">{Number(item.value).toFixed(2)} tCO₂e</div>
                    <div className="text-muted-foreground mt-0.5">
                      {((item.value / totalEmissions) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
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
