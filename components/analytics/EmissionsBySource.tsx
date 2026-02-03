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
import { Loader2 } from "lucide-react";

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

  // Prepare chart data
  const chartData = [
    {
      name: "Materials & Fuels",
      emissions: data.current.materialsAndFuels,
      fill: "#f97316", // Orange
    },
    {
      name: "Energy (Electricity)",
      emissions: data.current.energy,
      fill: "#eab308", // Yellow
    },
  ];

  // Calculate total
  const totalEmissions = data.current.materialsAndFuels + data.current.energy;

  // Format YoY change
  const formatYoY = (change: { percent: number; absolute: number } | null) => {
    if (!change) return "N/A";
    const sign = change.absolute >= 0 ? "+" : "";
    return `${sign}${change.percent}% (${sign}${change.absolute.toFixed(2)} tCO₂e)`;
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Emissions by Source</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis label={{ value: "Emissions (tCO₂e)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)} tCO₂e`, "Emissions"]}
            />
            <Bar dataKey="emissions" fill="#8884d8" />
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
              <TableHead className="text-right">YOY Change (%)</TableHead>
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
