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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

interface ScopeEmissionsData {
  current: {
    scope1: number;
    scope2: number;
  };
  previous: {
    scope1: number;
    scope2: number;
  } | null;
  yoyChange: {
    scope1: { percent: number; absolute: number } | null;
    scope2: { percent: number; absolute: number } | null;
  };
}

interface EmissionsByScopeProps {
  company: string;
  year: string;
  period: string;
}

export function EmissionsByScope({ company, year, period }: EmissionsByScopeProps) {
  const [data, setData] = useState<ScopeEmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/emissions/by-scope?company=${company}&year=${year}&period=${period}`
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

  // Prepare chart data
  const chartData = [
    {
      name: "Scope 1 (Direct)",
      emissions: data.current.scope1,
      fill: "#f97316", // Orange
    },
    {
      name: "Scope 2 (Indirect)",
      emissions: data.current.scope2,
      fill: "#3b82f6", // Blue
    },
  ];

  // Calculate total
  const totalEmissions = data.current.scope1 + data.current.scope2;

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
        <h2 className="text-lg font-semibold mb-4">Emissions by Scope</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis label={{ value: "Emissions (tCO₂e)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)} tCO₂e`, "Emissions"]}
            />
            <Bar dataKey="emissions" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Scope Wise Emissions</h2>
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
                rank: data.current.scope2 >= data.current.scope1 ? 1 : 2,
                name: "Scope 2",
                emissions: data.current.scope2,
                change: data.yoyChange.scope2,
              },
              {
                rank: data.current.scope1 >= data.current.scope2 ? 1 : 2,
                name: "Scope 1",
                emissions: data.current.scope1,
                change: data.yoyChange.scope1,
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
