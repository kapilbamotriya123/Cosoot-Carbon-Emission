import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import type { RoutingData } from "@/lib/parsers/types";
import type { ProductListResponse } from "@/lib/product-flows/types";

// GET /api/product-flows?companySlug=meta_engitech_pune&page=1&pageSize=50
//
// Returns a paginated list of products with work center counts,
// extracted from the routing_data JSONB.

export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50"))
    );

    if (!companySlug) {
      return NextResponse.json(
        { error: "companySlug is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT data FROM routing_data WHERE company_slug = $1`,
      [companySlug]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "No routing data found for this company" },
        { status: 404 }
      );
    }

    const routingData = result.rows[0].data as RoutingData;
    const allProducts = routingData.products;

    // Build list: productId + count of unique work centers
    const productList = allProducts.map((p) => ({
      productId: p.productId,
      workCenterCount: new Set(p.rows.map((r) => r.workCenter)).size,
    }));

    // Sort alphabetically for stable pagination
    productList.sort((a, b) => a.productId.localeCompare(b.productId));

    const total = productList.length;
    const offset = (page - 1) * pageSize;
    const paged = productList.slice(offset, offset + pageSize);

    const response: ProductListResponse = {
      products: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch product list:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
