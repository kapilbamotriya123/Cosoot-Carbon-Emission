"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Period {
  year: string;
  quarters: string[];
}

interface QuarterSelectorProps {
  company: string;
  onSelect: (year: string, quarter: string) => void;
}

export function QuarterSelector({ company, onSelect }: QuarterSelectorProps) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/emissions/available-periods?company=${company}`
      );
      if (!response.ok) throw new Error("Failed to fetch periods");
      const result = await response.json();
      setPeriods(result.periods || []);

      // Auto-select the latest available period
      if (result.periods?.length > 0) {
        const latest = result.periods[0];
        if (latest.quarters.length > 0) {
          const key = `${latest.year}-${latest.quarters[0]}`;
          setSelected(key);
          onSelect(latest.year, latest.quarters[0]);
        }
      }
    } catch {
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [company, onSelect]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  function handleChange(value: string) {
    setSelected(value);
    const [year, quarter] = value.split("-");
    onSelect(year, quarter);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading periods...</span>
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No data available</span>
    );
  }

  return (
    <Select value={selected} onValueChange={handleChange}>
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder="Select period" />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) =>
          period.quarters.map((quarter) => (
            <SelectItem
              key={`${period.year}-${quarter}`}
              value={`${period.year}-${quarter}`}
            >
              {period.year} - {quarter}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
