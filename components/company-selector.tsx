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

export function CompanySelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentCompany = searchParams.get("company") ?? COMPANIES[0].slug;

  function handleCompanyChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

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
