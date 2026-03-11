"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";

interface Props {
  company: string;
}

interface Period {
  year: string;
  quarters: string[];
}

const QUARTER_META: Record<string, { startMonth: string; endMonth: string; label: string }> = {
  Q1: { startMonth: "01", endMonth: "03", label: "Q1 (Jan–Mar)" },
  Q2: { startMonth: "04", endMonth: "06", label: "Q2 (Apr–Jun)" },
  Q3: { startMonth: "07", endMonth: "09", label: "Q3 (Jul–Sep)" },
  Q4: { startMonth: "10", endMonth: "12", label: "Q4 (Oct–Dec)" },
};

function getQuarterDates(year: string, quarter: string) {
  const meta = QUARTER_META[quarter];
  if (!meta) return { startDate: "", endDate: "" };
  const lastDay = new Date(Number(year), Number(meta.endMonth), 0).getDate();
  return {
    startDate: `${year}-${meta.startMonth}-01`,
    endDate: `${year}-${meta.endMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

interface ReportResult {
  fileName: string;
  downloadUrl: string;
  materialIds: string[];
}

export function ReportGenerationForm({ company }: Props) {
  // Available periods from sales data
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  // Date range state
  const [year, setYear] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCustomRange, setIsCustomRange] = useState(false);

  // Customer & materials state
  const [customers, setCustomers] = useState<string[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerCode, setCustomerCode] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);

  const [materials, setMaterials] = useState<string[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Form submission state
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<ReportResult[]>([]);

  // Derived: available quarters for the selected year
  const availableQuarters = periods.find((p) => p.year === year)?.quarters ?? [];

  // ---------- Data fetching ----------

  // Fetch available periods when company changes
  const fetchPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    setPeriods([]);
    setYear("");
    setSelectedQuarter("");
    setStartDate("");
    setEndDate("");

    try {
      const res = await fetch(`/api/sales/years?company=${company}`);
      const data = await res.json();
      if (data.success && data.periods?.length > 0) {
        setPeriods(data.periods);
        setYear(data.periods[0].year);
      }
    } catch {
      // Silently fail
    } finally {
      setPeriodsLoading(false);
    }
  }, [company]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Fetch customers scoped to selected period
  const fetchCustomers = useCallback(async () => {
    if (!year || (!selectedQuarter && !isCustomRange)) {
      setCustomers([]);
      setCustomerCode("");
      setCustomerQuery("");
      setMaterials([]);
      setSelectedMaterials([]);
      return;
    }

    setCustomersLoading(true);
    setCustomers([]);
    setCustomerCode("");
    setCustomerQuery("");
    setMaterials([]);
    setSelectedMaterials([]);

    try {
      let url = `/api/sales/customers?company=${company}&year=${year}`;
      if (selectedQuarter && !isCustomRange) {
        url += `&quarter=${selectedQuarter}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
      }
    } catch {
      // Silently fail
    } finally {
      setCustomersLoading(false);
    }
  }, [company, year, selectedQuarter, isCustomRange]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Fetch materials scoped to selected period + customer
  const fetchMaterials = useCallback(async () => {
    if (!customerCode) {
      setMaterials([]);
      setSelectedMaterials([]);
      return;
    }

    setMaterialsLoading(true);
    setMaterials([]);
    setSelectedMaterials([]);

    try {
      let url = `/api/sales/materials?company=${company}&customer=${customerCode}&year=${year}`;
      if (selectedQuarter && !isCustomRange) {
        url += `&quarter=${selectedQuarter}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setMaterials(data.data);
      }
    } catch {
      // Silently fail
    } finally {
      setMaterialsLoading(false);
    }
  }, [company, year, selectedQuarter, isCustomRange, customerCode]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Close customer dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------- Handlers ----------

  function handleYearChange(newYear: string) {
    setYear(newYear);
    // Reset quarter since available quarters may differ
    setSelectedQuarter("");
    setStartDate("");
    setEndDate("");
  }

  function handleQuarterSelect(quarter: string) {
    setSelectedQuarter(quarter);
    setIsCustomRange(false);
    const dates = getQuarterDates(year, quarter);
    setStartDate(dates.startDate);
    setEndDate(dates.endDate);
  }

  function handleCustomerSelect(code: string) {
    setCustomerCode(code);
    setCustomerQuery(code);
    setCustomerDropdownOpen(false);
  }

  function toggleMaterial(materialId: string) {
    setSelectedMaterials((prev) =>
      prev.includes(materialId)
        ? prev.filter((m) => m !== materialId)
        : [...prev, materialId]
    );
  }

  function selectAllMaterials() {
    setSelectedMaterials([...materials]);
  }

  async function handleGenerate(mode: "combined" | "individual") {
    if (!startDate || !endDate || !customerCode || selectedMaterials.length === 0) {
      return;
    }

    setStatus("generating");
    setErrorMessage("");
    setResults([]);

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: company,
          startDate,
          endDate,
          customerCode,
          materialIds: selectedMaterials,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Report generation failed");
        return;
      }

      setStatus("success");
      setResults(
        data.reports.map((r: { fileName: string; downloadUrl: string; materialIds: string[] }) => ({
          fileName: r.fileName,
          downloadUrl: r.downloadUrl,
          materialIds: r.materialIds,
        }))
      );
    } catch {
      setStatus("error");
      setErrorMessage("Network error — is the server running?");
    }
  }

  const isFormValid =
    startDate && endDate && customerCode && selectedMaterials.length > 0;

  const availableYears = periods.map((p) => p.year);

  return (
    <Card className="p-6">
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* Date Range Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Reporting Period</h2>

          <div className="flex flex-wrap items-end gap-4">
            {/* Year selector */}
            <div className="space-y-1.5">
              <Label>Year</Label>
              {periodsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : availableYears.length > 0 ? (
                <Select value={year} onValueChange={handleYearChange}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground h-9 flex items-center">
                  No sales data found
                </p>
              )}
            </div>

            {/* Quarter presets — only show quarters with data */}
            {year && (
              <div className="space-y-1.5">
                <Label>Quarter</Label>
                <div className="flex gap-2">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
                    const hasData = availableQuarters.includes(q);
                    return (
                      <Button
                        key={q}
                        type="button"
                        variant={selectedQuarter === q && !isCustomRange ? "default" : "outline"}
                        size="sm"
                        disabled={!hasData}
                        onClick={() => handleQuarterSelect(q)}
                      >
                        {q}
                      </Button>
                    );
                  })}
                  <Button
                    type="button"
                    variant={isCustomRange ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsCustomRange(true);
                      setSelectedQuarter("");
                      setStartDate("");
                      setEndDate("");
                    }}
                  >
                    Custom
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Custom date range inputs */}
          {isCustomRange && (
            <div className="flex gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>
          )}

          {/* Show selected date range */}
          {startDate && endDate && (
            <p className="text-sm text-muted-foreground">
              Period: {startDate} to {endDate}
            </p>
          )}
        </div>

        {/* Customer Code Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Customer</h2>

          <div className="space-y-1.5" ref={customerRef}>
            <Label htmlFor="customer-code">Customer Code</Label>
            {!startDate || !endDate ? (
              <p className="text-sm text-muted-foreground">
                Select a reporting period first.
              </p>
            ) : customersLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading customers...
              </div>
            ) : (
              <div className="relative w-64">
                <Input
                  id="customer-code"
                  type="text"
                  placeholder={customers.length > 0 ? "Search or paste customer code" : "Enter customer code (e.g. 100592)"}
                  value={customerQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerQuery(val);
                    setCustomerCode(val);
                    setCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  autoComplete="off"
                />
                {customerDropdownOpen && customers.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {customers
                      .filter((c) => c.toLowerCase().includes(customerQuery.toLowerCase()))
                      .map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => handleCustomerSelect(code)}
                          className={`w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                            code === customerCode ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    {customers.filter((c) => c.toLowerCase().includes(customerQuery.toLowerCase())).length === 0 && (
                      <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Material IDs Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Material IDs</h2>
            {materials.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectAllMaterials}
                disabled={selectedMaterials.length === materials.length}
              >
                Select All
              </Button>
            )}
          </div>

          {!customerCode ? (
            <p className="text-sm text-muted-foreground">
              Select a customer first to see available materials.
            </p>
          ) : materialsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading materials...
            </div>
          ) : materials.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {materials.map((id) => {
                  const isSelected = selectedMaterials.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleMaterial(id)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {id}
                      {isSelected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
              {selectedMaterials.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedMaterials.length} material{selectedMaterials.length > 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No materials found for this customer in the selected period.
            </p>
          )}
        </div>

        {/* Submit */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {selectedMaterials.length > 1 ? (
            <>
              <Button
                type="button"
                disabled={!isFormValid || status === "generating"}
                className="min-w-[200px]"
                onClick={() => handleGenerate("combined")}
              >
                {status === "generating" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Combined Report"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!isFormValid || status === "generating"}
                className="min-w-[200px]"
                onClick={() => handleGenerate("individual")}
              >
                {status === "generating" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  `Individual Reports (${selectedMaterials.length})`
                )}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={!isFormValid || status === "generating"}
              className="min-w-[180px]"
              onClick={() => handleGenerate("combined")}
            >
              {status === "generating" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Report...
                </>
              ) : (
                "Generate Report"
              )}
            </Button>
          )}
        </div>

        {/* Success Result */}
        {status === "success" && results.length > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              <div className="space-y-3 w-full">
                <p className="font-medium text-green-800 dark:text-green-200">
                  {results.length === 1
                    ? "Report generated successfully"
                    : `${results.length} reports generated successfully`}
                </p>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-green-200 bg-white/60 px-3 py-2 dark:border-green-800 dark:bg-green-900/30"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                        {r.fileName}
                      </p>
                      {results.length > 1 && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          {r.materialIds.join(", ")}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(r.downloadUrl, "_blank")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-green-600 dark:text-green-400">
                  Download links valid for 15 minutes
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Result */}
        {status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Report generation failed
                </p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}
