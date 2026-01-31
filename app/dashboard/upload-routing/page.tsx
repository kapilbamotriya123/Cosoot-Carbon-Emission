"use client";

import { useState } from "react";

// Available companies — add new ones here as you onboard them.
// The value must match the parser registry key in lib/parsers/index.ts
const COMPANIES = [
  { slug: "meta_engitech_pune", label: "Meta Engitech - Pune" },
];

export default function UploadRoutingPage() {
  const [companySlug, setCompanySlug] = useState(COMPANIES[0].slug);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "parsing" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");
  // Upload progress as a percentage (0-100). Only tracks the upload phase;
  // once the file is fully sent, we switch to "parsing" status while the server processes it.
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult("");
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companySlug", companySlug);

    try {
      // Using XMLHttpRequest instead of fetch() because fetch doesn't support
      // upload progress events. XHR fires progress events as bytes are sent,
      // which lets us show a percentage bar for large files (25-30MB).
      const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
            // Once upload hits 100%, server is now parsing the file
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
    } catch (err) {
      setStatus("error");
      setResult(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Upload BOM / Routing Data</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company selector */}
        <div>
          <label htmlFor="company" className="block text-sm font-medium mb-2">
            Company
          </label>
          <select
            id="company"
            value={companySlug}
            onChange={(e) => setCompanySlug(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 dark:border-zinc-700"
          >
            {COMPANIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* File input */}
        <div>
          <label htmlFor="file" className="block text-sm font-medium mb-2">
            Routing Excel File (.xlsx)
          </label>
          <input
            id="file"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border rounded-lg px-3 py-2 dark:border-zinc-700"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!file || status === "uploading" || status === "parsing"}
          className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {status === "uploading"
            ? `Uploading... ${uploadProgress}%`
            : status === "parsing"
              ? "Processing file on server..."
              : "Upload & Parse"}
        </button>

        {/* Progress bar — visible during upload and server-side parsing */}
        {(status === "uploading" || status === "parsing") && (
          <div className="w-full bg-zinc-200 rounded-full h-2 dark:bg-zinc-700">
            <div
              className="bg-zinc-900 h-2 rounded-full transition-all duration-300 dark:bg-white"
              style={{ width: `${status === "parsing" ? 100 : uploadProgress}%` }}
            />
          </div>
        )}
      </form>

      {/* Result display */}
      {result && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">
            {status === "success" ? "Parsed Successfully" : "Error"}
          </h2>
          <pre
            className={`p-4 rounded-lg text-sm overflow-auto ${
              status === "success"
                ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
                : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
            }`}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
