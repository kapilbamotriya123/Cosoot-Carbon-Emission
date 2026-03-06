"use client";

import { useUser } from "@clerk/nextjs";

export function useAuthRole() {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return { isLoaded, role: null as null, companySlug: null as null };
  }

  const metadata = user.publicMetadata as {
    role?: string;
    companySlug?: string;
  };

  return {
    isLoaded: true as const,
    role: (metadata?.role ?? "user") as "admin" | "user",
    companySlug: metadata?.companySlug ?? null,
  };
}
