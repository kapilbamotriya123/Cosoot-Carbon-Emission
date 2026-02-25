"use client";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export interface RankedEmission {
  name: string;
  emissions: number;
  unit: string;
}

interface EmissionsRankedTableProps {
  data: RankedEmission[];
  loading: boolean;
  title: string;
}

export function EmissionsRankedTable({
  data,
  loading,
  title,
}: EmissionsRankedTableProps) {
  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          No data available
        </div>
      </Card>
    );
  }

  const maxEmissions = Math.max(...data.map((d) => d.emissions));

  return (
    <Card className="p-6">
      <div className="overflow-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-[80px]">Ranking</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[300px]"></TableHead>
              <TableHead className="text-right">Emissions</TableHead>
              <TableHead className="text-right w-[80px]">Unit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => {
              const barPercent =
                maxEmissions > 0
                  ? (row.emissions / maxEmissions) * 100
                  : 0;

              return (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 h-5">
                      <div className="flex-1 bg-gray-200 rounded-sm h-3 overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-sm transition-all"
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.emissions.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.unit}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
