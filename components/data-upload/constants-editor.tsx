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
import { Download, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  company: string;
}

type RecalcScope = "quarter" | "forward";

export function ConstantsEditor({ company }: Props) {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState(String(currentQuarter));

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Recalculation prompt state
  const [showRecalcPrompt, setShowRecalcPrompt] = useState(false);
  const [recalcYear, setRecalcYear] = useState(0);
  const [recalcQuarter, setRecalcQuarter] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i + 1));

  function handleDownload() {
    window.open(
      `/api/constants/template?company=${company}&year=${year}&quarter=${quarter}`,
      "_blank"
    );
  }

  async function handleFileUpload() {
    if (!uploadFile) return;

    setUploading(true);
    setUploadMessage(null);
    setShowRecalcPrompt(false);
    setRecalcMessage(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("company", company);
    formData.append("year", year);
    formData.append("quarter", quarter);

    try {
      const res = await fetch("/api/constants/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadMessage({ type: "error", text: data.error || "Upload failed" });
        return;
      }

      setUploadMessage({ type: "success", text: data.message });
      setUploadFile(null);

      // If emission data exists for this quarter, prompt for recalculation
      if (data.hasExistingEmissions) {
        setRecalcYear(data.year);
        setRecalcQuarter(data.quarter);
        setShowRecalcPrompt(true);
      }
    } catch {
      setUploadMessage({ type: "error", text: "Network error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRecalculate(scope: RecalcScope) {
    setRecalculating(true);
    setRecalcMessage(null);

    try {
      const res = await fetch("/api/emissions/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          year: recalcYear,
          quarter: recalcQuarter,
          scope,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecalcMessage({ type: "error", text: data.error || "Recalculation failed" });
        return;
      }

      setRecalcMessage({ type: "success", text: data.message });
      setShowRecalcPrompt(false);
    } catch {
      setRecalcMessage({ type: "error", text: "Network error" });
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Quarter selector + download */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-[120px]">
          <Label>Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[100px]">
          <Label>Quarter</Label>
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1</SelectItem>
              <SelectItem value="2">Q2</SelectItem>
              <SelectItem value="3">Q3</SelectItem>
              <SelectItem value="4">Q4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Download the current constants, edit the values in the spreadsheet, then upload below for the selected quarter.
      </p>

      {/* File upload */}
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Label>Upload Constants</Label>
          <Input
            type="file"
            accept=".xlsx,.xls"
            className="mt-1.5"
            onChange={(e) => {
              setUploadFile(e.target.files?.[0] ?? null);
              setUploadMessage(null);
              setShowRecalcPrompt(false);
              setRecalcMessage(null);
            }}
          />
        </div>
        <Button
          onClick={handleFileUpload}
          disabled={!uploadFile || uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Upload
        </Button>
      </div>

      {/* Upload result message */}
      {uploadMessage && (
        <p className={`text-sm flex items-center gap-1.5 ${
          uploadMessage.type === "success" ? "text-green-600" : "text-red-600"
        }`}>
          {uploadMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {uploadMessage.text}
        </p>
      )}

      {/* Recalculation prompt */}
      {showRecalcPrompt && !recalculating && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            Emission data exists for Q{recalcQuarter} {recalcYear}. Recalculate with new constants?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRecalculate("quarter")}
            >
              Recalculate Q{recalcQuarter} {recalcYear} only
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRecalculate("forward")}
            >
              Recalculate Q{recalcQuarter} {recalcYear} and onward
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRecalcPrompt(false)}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {/* Recalculation loader */}
      {recalculating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recalculating emissions...
        </div>
      )}

      {/* Recalculation result */}
      {recalcMessage && (
        <p className={`text-sm flex items-center gap-1.5 ${
          recalcMessage.type === "success" ? "text-green-600" : "text-red-600"
        }`}>
          {recalcMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {recalcMessage.text}
        </p>
      )}
    </div>
  );
}
