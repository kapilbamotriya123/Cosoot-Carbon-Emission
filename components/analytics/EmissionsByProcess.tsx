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
}

export function EmissionsByProcess({ company, year, period }: EmissionsByProcessProps) {
  const [data, setData] = useState<ProcessEmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/emissions/by-process?company=${company}&year=${year}&period=${period}`
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

  // Prepare chart data (top 10 work centers)
  const chartData = data.data.slice(0, 10).map((item) => ({
    name: item.workCenter,
    emissions: item.emissions,
  }));

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
        <h2 className="text-lg font-semibold mb-4">Emissions by Process</h2>
        <p className="text-sm text-muted-foreground mb-4">Top 10 work centers by emissions</p>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" height={60} />
            <YAxis label={{ value: "Emissions (tCO₂e)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)} tCO₂e`, "Emissions"]}
            />
            <Bar dataKey="emissions" fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Process Wise Emissions</h2>
        <div className="mb-4 text-sm text-muted-foreground">
          Total Emissions: <span className="font-semibold text-foreground">{data.totalEmissions.toFixed(2)} Metric Tons</span>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[80px]">Ranking</TableHead>
                <TableHead>Work Center</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Emissions</TableHead>
                <TableHead className="text-right">YOY Change (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row, index) => (
                <TableRow key={row.workCenter}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="font-mono">{row.workCenter}</TableCell>
                  <TableCell className="text-muted-foreground">{row.description || "—"}</TableCell>
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
