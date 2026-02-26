"use client";

import { useState } from "react";
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
import { CheckCircle2, AlertCircle } from "lucide-react";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

interface Props {
  company: string;
  onUploadComplete?: () => void;
}

/**
 * Unified consumption form that handles both company types.
 *
 * Meta Engitech → POST /api/consumption/upload (needs year + month)
 * Shakambhari   → POST /api/production/upload (dates extracted from data)
 *
 * The admin sees "Consumption Data" regardless of company.
 * Internally, we route to the correct backend API.
 */
export function UnifiedConsumptionForm({ company, onUploadComplete }: Props) {
  const isMetaEngitech = company === "meta_engitech_pune";

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companySlug", company);

    // Meta Engitech requires year/month params; Shakambhari extracts dates from the file
    if (isMetaEngitech) {
      formData.append("year", year);
      formData.append("month", month);
    }

    const endpoint = isMetaEngitech
      ? "/api/consumption/upload"
      : "/api/production/upload";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult(data.error || "Upload failed");
        return;
      }

      setStatus("success");
      setResult(JSON.stringify(data, null, 2));
      onUploadComplete?.();
    } catch {
      setStatus("error");
      setResult("Network error — is the server running?");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {/* Year/month selectors — only for Meta Engitech */}
      {isMetaEngitech && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="consumption-year">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="consumption-year" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="consumption-month">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="consumption-month" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {!isMetaEngitech && (
        <p className="text-sm text-muted-foreground">
          Dates will be extracted automatically from the uploaded file.
        </p>
      )}

      <div>
        <Label htmlFor="consumption-file">Consumption Data Excel File (.xlsx)</Label>
        <Input
          id="consumption-file"
          type="file"
          accept=".xlsx,.xls"
          className="mt-1.5"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button
        type="submit"
        disabled={!file || status === "uploading"}
      >
        {status === "uploading" ? "Uploading..." : "Upload & Parse"}
      </Button>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-lg text-sm ${
          status === "success"
            ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
            : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
        }`}>
          <div className="flex items-center gap-2 mb-2 font-medium">
            {status === "success" ? (
              <><CheckCircle2 className="h-4 w-4" /> Parsed Successfully</>
            ) : (
              <><AlertCircle className="h-4 w-4" /> Error</>
            )}
          </div>
          <pre className="overflow-auto whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </form>
  );
}
