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
    const search = (searchParams.get("search") ?? "").trim();

    const offset = (page - 1) * pageSize;
    const params: unknown[] = [companySlug];
    let whereSearch = "";
    if (search) {
      params.push(`%${search}%`);
      whereSearch = `AND (product_id ILIKE $${params.length} OR product_name ILIKE $${params.length})`;
    }

    const baseFrom = `
      FROM (
        SELECT DISTINCT product_id, product_name
        FROM production_data_shakambhari
        WHERE company_slug = $1 ${whereSearch}
      ) AS distinct_products
    `;

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total ${baseFrom}`,
      params
    );
    const total = totalResult.rows[0]?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    const pageParams = [...params, pageSize, offset];
    const pageResult = await pool.query(
      `SELECT product_id, product_name ${baseFrom}
       ORDER BY product_id ASC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    const products = pageResult.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
    }));

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
