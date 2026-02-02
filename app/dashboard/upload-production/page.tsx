"use client";

import { useState } from "react";

// Available companies — must match parser registry keys in lib/parsers/production/index.ts
const COMPANIES = [
  { slug: "shakambhari", label: "Shakambhari" },
];

export default function UploadProductionPage() {
  const [companySlug, setCompanySlug] = useState(COMPANIES[0].slug);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companySlug", companySlug);

    try {
      const res = await fetch("/api/production/upload", {
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
    } catch {
      setStatus("error");
      setResult("Network error — is the server running?");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Upload Production Data</h1>

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
            Production Excel File (.xlsx, .xls)
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
          disabled={!file || status === "uploading"}
          className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {status === "uploading" ? "Uploading..." : "Upload & Parse"}
        </button>
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
