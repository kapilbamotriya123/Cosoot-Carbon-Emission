"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReportGenerationForm } from "@/components/reports/report-generation-form";
import { COMPANIES } from "@/lib/constants";

function ReportGenerationContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  const companyLabel =
    COMPANIES.find((c) => c.slug === company)?.label ?? "Select a company";

  if (!company) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Report Generation</h1>
        <p className="text-muted-foreground">
          Please select a company from the top bar to generate a report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Report Generation</h1>
        <p className="text-muted-foreground mt-1">
          Generate EU CBAM quarterly Excel reports for {companyLabel}
        </p>
      </div>

      <ReportGenerationForm company={company} />
    </div>
  );
}

export default function ReportGenerationPage() {
  return (
    <Suspense>
      <ReportGenerationContent />
    </Suspense>
  );
}
