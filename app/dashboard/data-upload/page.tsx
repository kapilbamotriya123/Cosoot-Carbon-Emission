"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { RoutingUploadForm } from "@/components/data-upload/routing-upload-form";
import { UnifiedConsumptionForm } from "@/components/data-upload/unified-consumption-form";
import { ConstantsEditor } from "@/components/data-upload/constants-editor";
import { SalesUploadForm } from "@/components/data-upload/sales-upload-form";
import { UploadHistory } from "@/components/data-upload/upload-history";
import { getUploadTabs } from "@/lib/upload-config";
import { COMPANIES } from "@/lib/constants";

function DataUploadContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  // Refresh key — increment after a successful upload to refetch history
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const refreshHistory = () => setHistoryRefreshKey((k) => k + 1);

  const companyLabel = COMPANIES.find((c) => c.slug === company)?.label ?? "Select a company";

  if (!company) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Data Upload</h1>
        <p className="text-muted-foreground">
          Please select a company from the top bar to upload data.
        </p>
      </div>
    );
  }

  const tabs = getUploadTabs(company);
  const defaultTab = tabs[0]?.key ?? "consumption";

  // For the upload history, Shakambhari's consumption tab actually tracks "production" uploads
  const consumptionHistoryType = company === "meta_engitech_pune" ? "consumption" : "production";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Data Upload</h1>
        <p className="text-muted-foreground mt-1">{companyLabel}</p>
      </div>

      {/* Tabbed interface */}
      <Card className="p-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Routing tab — only shown for Meta Engitech */}
          {tabs.some((t) => t.key === "routing") && (
            <TabsContent value="routing">
              <RoutingUploadForm company={company} onUploadComplete={refreshHistory} />
              <UploadHistory
                company={company}
                uploadType="routing"
                refreshKey={historyRefreshKey}
              />
            </TabsContent>
          )}

          {/* Consumption Data tab — shown for all companies */}
          <TabsContent value="consumption">
            <UnifiedConsumptionForm company={company} onUploadComplete={refreshHistory} />
            <UploadHistory
              company={company}
              uploadType={consumptionHistoryType}
              refreshKey={historyRefreshKey}
            />
          </TabsContent>

          {/* Emission Constants tab */}
          <TabsContent value="constants">
            <ConstantsEditor company={company} />
          </TabsContent>

          {/* Sales tab */}
          <TabsContent value="sales">
            <SalesUploadForm company={company} onUploadComplete={refreshHistory} />
            <UploadHistory
              company={company}
              uploadType="sales"
              refreshKey={historyRefreshKey}
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

export default function DataUploadPage() {
  return (
    <Suspense>
      <DataUploadContent />
    </Suspense>
  );
}
