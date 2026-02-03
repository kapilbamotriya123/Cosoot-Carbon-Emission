"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
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
import type {
  ProductListItem,
  ProductListResponse,
} from "@/lib/product-flows-shakambhari/types";

function ProductFlowsShakambhariContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? "shakambhari";

  const [allProducts, setAllProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const pageSize = 50;

  // Reset page when company changes
  useEffect(() => {
    setPage(1);
    setSearchQuery("");
  }, [company]);

  // Fetch all products when search is active, otherwise fetch paginated
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      setError(null);
      try {
        // If searching, fetch all products; otherwise paginate
        const fetchAll = searchQuery.trim().length > 0;
        const url = fetchAll
          ? `/api/product-flows-shakambhari?companySlug=${company}&page=1&pageSize=10000`
          : `/api/product-flows-shakambhari?companySlug=${company}&page=${page}&pageSize=${pageSize}`;

        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data: ProductListResponse = await res.json();
        if (!cancelled) {
          setAllProducts(data.products);
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
  }, [company, page, searchQuery]);

  // Filter products based on search query (client-side)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      return allProducts;
    }
    const query = searchQuery.toLowerCase().trim();
    return allProducts.filter(
      (p) =>
        p.productId.toLowerCase().includes(query) ||
        p.productName.toLowerCase().includes(query)
    );
  }, [allProducts, searchQuery]);

  // Pagination for filtered results
  const paginatedProducts = useMemo(() => {
    if (searchQuery.trim()) {
      // When searching, show all filtered results (no pagination)
      return filteredProducts;
    }
    // When not searching, already paginated from API
    return allProducts;
  }, [searchQuery, filteredProducts, allProducts]);

  const totalPages = searchQuery.trim() ? 1 : Math.ceil(total / pageSize);

  const displayedTotal = searchQuery.trim() ? filteredProducts.length : total;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            Product Flows - Shakambhari
          </h1>
          <p className="text-sm text-muted-foreground">
            {displayedTotal > 0
              ? `${displayedTotal} product${displayedTotal === 1 ? "" : "s"} found. Click "View Flow" to see the manufacturing flow.`
              : "No production data found."}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by product ID or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
              <TableHead>Product Name</TableHead>
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
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              : paginatedProducts.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-muted-foreground">
                      {searchQuery.trim()
                        ? i + 1
                        : (page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {p.productId}
                    </TableCell>
                    <TableCell>{p.productName}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/dashboard/product-flows-shakambhari/${encodeURIComponent(p.productId)}?company=${company}`}
                        >
                          View Flow
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            {!loading && paginatedProducts.length === 0 && !error && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  {searchQuery.trim()
                    ? `No products found matching "${searchQuery}"`
                    : "No products found. Upload production data first."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (hidden when searching) */}
      {!searchQuery.trim() && totalPages > 1 && (
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

      {/* Search results info */}
      {searchQuery.trim() && !loading && (
        <p className="text-sm text-muted-foreground mt-4">
          Showing {paginatedProducts.length} of {allProducts.length} products
        </p>
      )}
    </div>
  );
}

export default function ProductFlowsShakambhariPage() {
  return (
    <Suspense>
      <ProductFlowsShakambhariContent />
    </Suspense>
  );
}
