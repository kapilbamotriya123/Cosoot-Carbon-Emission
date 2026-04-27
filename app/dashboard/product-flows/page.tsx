"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANIES } from "@/lib/constants";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ProductListItem as MetaProductListItem, ProductListResponse as MetaProductListResponse } from "@/lib/product-flows/types";
import type { ProductListItem as ShakProductListItem, ProductListResponse as ShakProductListResponse } from "@/lib/product-flows-shakambhari/types";

type ProductItem = (MetaProductListItem | ShakProductListItem) & {
  productId: string;
  productName?: string;
  workCenterCount?: number;
};

const SEARCH_DEBOUNCE_MS = 500;
const PAGE_SIZE = 50;

function ProductFlowsContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? COMPANIES[0].slug;
  const isShakambhari = company === "shakambhari";

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearching = searchInput !== debouncedSearch;

  // Reset to page 1 when company changes (search persists per Kapil's call)
  useEffect(() => {
    setPage(1);
  }, [company]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      setError(null);
      try {
        const baseEndpoint = isShakambhari
          ? "/api/product-flows-shakambhari"
          : "/api/product-flows";
        const params = new URLSearchParams({
          companySlug: company,
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        const trimmed = debouncedSearch.trim();
        if (trimmed) params.set("search", trimmed);

        const res = await fetch(`${baseEndpoint}?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data: MetaProductListResponse | ShakProductListResponse = await res.json();
        if (!cancelled) {
          setProducts(data.products as ProductItem[]);
          setTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [company, isShakambhari, page, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Product Flows</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} product${total === 1 ? "" : "s"} found. Click "View Flow" to see the manufacturing route.`
              : "Select a company to view product flows."}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by product ID or work center..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9 pr-9"
        />
        {isSearching || (loading && debouncedSearch.trim()) ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : searchInput ? (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Product ID</TableHead>
              {isShakambhari ? (
                <TableHead>Product Name</TableHead>
              ) : (
                <TableHead className="w-[150px] text-center">
                  Work Centers
                </TableHead>
              )}
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell className={isShakambhari ? "" : "text-center"}>
                      <Skeleton className={isShakambhari ? "h-4 w-48" : "mx-auto h-4 w-8"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              : products.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {p.productId}
                    </TableCell>
                    {isShakambhari ? (
                      <TableCell>{p.productName}</TableCell>
                    ) : (
                      <TableCell className="text-center">
                        {p.workCenterCount}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/dashboard/product-flows/${encodeURIComponent(p.productId)}?company=${company}`}
                        >
                          View Flow
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            {!loading && products.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {debouncedSearch.trim()
                    ? `No products found matching "${debouncedSearch.trim()}"`
                    : "No products found. Upload routing data first."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductFlowsPage() {
  return (
    <Suspense>
      <ProductFlowsContent />
    </Suspense>
  );
}
