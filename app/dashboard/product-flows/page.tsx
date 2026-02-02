"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANIES } from "@/lib/constants";
import type { ProductListItem, ProductListResponse } from "@/lib/product-flows/types";

function ProductFlowsContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? COMPANIES[0].slug;

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [company]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/product-flows?companySlug=${company}&page=${page}&pageSize=${pageSize}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data: ProductListResponse = await res.json();
        if (!cancelled) {
          setProducts(data.products);
          setTotal(data.total);
          setTotalPages(data.totalPages);
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
  }, [company, page]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Product Flows</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {total > 0
          ? `${total} products found. Click "View Flow" to see the manufacturing route.`
          : "Select a company to view product flows."}
      </p>

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
              <TableHead className="w-[150px] text-center">
                Work Centers
              </TableHead>
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
                    <TableCell className="text-center">
                      <Skeleton className="mx-auto h-4 w-8" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              : products.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {p.productId}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.workCenterCount}
                    </TableCell>
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
                  No products found. Upload routing data first.
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
