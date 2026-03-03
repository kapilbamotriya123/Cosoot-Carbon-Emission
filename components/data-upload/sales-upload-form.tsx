"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  company: string;
  onUploadComplete?: () => void;
}

/**
 * Sales data upload form.
 *
 * No year/month selectors needed — the parser extracts dates from the
 * "Month" column in the Excel file (e.g. "Jan-25").
 */
export function SalesUploadForm({ company, onUploadComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companySlug", company);

    try {
      const res = await fetch("/api/sales/upload", {
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
      <p className="text-sm text-muted-foreground">
        Upload the sales data Excel file. Months will be extracted automatically
        from the &quot;Month&quot; column (e.g. &quot;Jan-25&quot;).
      </p>

      <div>
        <Label htmlFor="sales-file">Sales Data Excel File (.xlsx)</Label>
        <Input
          id="sales-file"
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
