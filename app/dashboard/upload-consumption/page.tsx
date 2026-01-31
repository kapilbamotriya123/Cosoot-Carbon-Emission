"use client";

import { useState } from "react";

// Available companies — must match parser registry keys in lib/parsers/consumption/index.ts
const COMPANIES = [
  { slug: "meta_engitech_pune", label: "Meta Engitech - Pune" },
];

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function UploadConsumptionPage() {
  const currentYear = new Date().getFullYear();
  const [companySlug, setCompanySlug] = useState(COMPANIES[0].slug);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
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
    formData.append("year", String(year));
    formData.append("month", String(month));

    try {
      const res = await fetch("/api/consumption/upload", {
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

  // Generate year options: current year back to 5 years ago
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        Upload Monthly Consumption Data
      </h1>

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

        {/* Year and Month selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium mb-2">
              Year
            </label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="month" className="block text-sm font-medium mb-2">
              Month
            </label>
            <select
              id="month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* File input */}
        <div>
          <label htmlFor="file" className="block text-sm font-medium mb-2">
            Consumption Excel File (.xlsx)
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
