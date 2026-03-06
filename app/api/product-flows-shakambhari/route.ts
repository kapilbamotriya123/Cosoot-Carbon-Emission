import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import type { ProductListResponse } from "@/lib/product-flows-shakambhari/types";

// GET /api/product-flows-shakambhari?companySlug=shakambhari&page=1&pageSize=50
//
// Returns paginated list of unique products from production_data_shakambhari table.

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    await initializeSchema();

    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug") ?? "shakambhari";
    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "50");

    // Fetch distinct products ordered by product_id
    const result = await pool.query(
      `
      SELECT DISTINCT product_id, product_name
      FROM production_data_shakambhari
      WHERE company_slug = $1
      ORDER BY product_id ASC
      `,
      [companySlug]
    );

    const allProducts = result.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
    }));

    const total = allProducts.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const products = allProducts.slice(start, end);

    const response: ProductListResponse = {
      products,
      total,
      page,
      pageSize,
      totalPages,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch Shakambhari product list:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
