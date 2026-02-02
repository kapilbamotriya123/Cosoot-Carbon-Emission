import { Suspense } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { CompanySelector } from "@/components/company-selector";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Suspense>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <Suspense>
            <CompanySelector />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            {/* Placeholder for user avatar — will come from auth */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              A
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
