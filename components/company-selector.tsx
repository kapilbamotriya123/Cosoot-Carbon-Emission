"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPANIES } from "@/lib/constants";
import { useAuthRole } from "@/hooks/use-auth-role";
import { Skeleton } from "@/components/ui/skeleton";

export function CompanySelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, role } = useAuthRole();

  const currentCompany = searchParams.get("company") ?? COMPANIES[0].slug;
  const companyLabel =
    COMPANIES.find((c) => c.slug === currentCompany)?.label ?? currentCompany;

  function handleCompanyChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (!isLoaded) {
    return <Skeleton className="h-9 w-[200px]" />;
  }

  // Regular users see a static label — their company is set via metadata
  if (role === "user") {
    return (
      <div className="flex h-9 w-[200px] items-center rounded-md border px-3 text-sm font-medium">
        {companyLabel}
      </div>
    );
  }

  // Admin sees the dropdown
  return (
    <Select value={currentCompany} onValueChange={handleCompanyChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select company" />
      </SelectTrigger>
      <SelectContent>
        {COMPANIES.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
