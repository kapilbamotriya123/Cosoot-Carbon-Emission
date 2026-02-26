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

export function RoutingUploadForm({ company, onUploadComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "parsing" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult("");
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companySlug", company);

    try {
      // Using XMLHttpRequest for upload progress tracking (routing files can be 25-30MB)
      const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
            if (percent === 100) {
              setStatus("parsing");
            }
          }
        };

        xhr.onload = () => {
          try {
            const responseData = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(responseData);
            } else {
              reject(new Error(responseData.error || "Upload failed"));
            }
          } catch {
            reject(new Error("Invalid response from server"));
          }
        };

        xhr.onerror = () => reject(new Error("Network error — is the server running?"));

        xhr.open("POST", "/api/routing/upload");
        xhr.send(formData);
      });

      setStatus("success");
      setResult(JSON.stringify(data, null, 2));
      onUploadComplete?.();
    } catch (err) {
      setStatus("error");
      setResult(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="routing-file">Routing Excel File (.xlsx)</Label>
        <Input
          id="routing-file"
          type="file"
          accept=".xlsx,.xls"
          className="mt-1.5"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button
        type="submit"
        disabled={!file || status === "uploading" || status === "parsing"}
      >
        {status === "uploading"
          ? `Uploading... ${uploadProgress}%`
          : status === "parsing"
            ? "Processing file on server..."
            : "Upload & Parse"}
      </Button>

      {/* Progress bar */}
      {(status === "uploading" || status === "parsing") && (
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${status === "parsing" ? 100 : uploadProgress}%` }}
          />
        </div>
      )}

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
