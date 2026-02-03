import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { buildGraph } from "@/lib/product-flows-shakambhari/build-graph";
import type {
  ProductFlowResponse,
  ProductionRecord,
} from "@/lib/product-flows-shakambhari/types";

// GET /api/product-flows-shakambhari/[productId]?companySlug=shakambhari&year=2025&month=2
//
// Returns React Flow nodes + edges for a single product's flow.
// Shows data from the FIRST occurrence (earliest date) of the product in the selected month.
// Structure: Input materials → Work center → Main product + Byproducts

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    await initializeSchema();

    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug") ?? "shakambhari";
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    // Fetch available months for this product
    const monthsResult = await pool.query(
      `
      SELECT DISTINCT year, month
      FROM production_data_shakambhari
      WHERE company_slug = $1 AND product_id = $2
      ORDER BY year DESC, month DESC
      `,
      [companySlug, productId]
    );

    if (monthsResult.rows.length === 0) {
      return NextResponse.json(
        { error: `No production data found for product ${productId}` },
        { status: 404 }
      );
    }

    const availableMonths: { year: number; month: number }[] =
      monthsResult.rows.map((r) => ({ year: r.year, month: r.month }));

    // Determine which month to use: explicit params or latest available
    let selectedYear: number;
    let selectedMonth: number;

    if (yearParam && monthParam) {
      selectedYear = parseInt(yearParam);
      selectedMonth = parseInt(monthParam);
    } else {
      selectedYear = availableMonths[0].year;
      selectedMonth = availableMonths[0].month;
    }

    // Fetch the FIRST occurrence (earliest date) of this product in the selected month
    const recordResult = await pool.query(
      `
      SELECT *
      FROM production_data_shakambhari
      WHERE company_slug = $1 AND product_id = $2 AND year = $3 AND month = $4
      ORDER BY date ASC, work_center ASC
      LIMIT 1
      `,
      [companySlug, productId, selectedYear, selectedMonth]
    );

    if (recordResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: `No production data found for ${productId} in ${selectedYear}-${selectedMonth}`,
        },
        { status: 404 }
      );
    }

    const rawRecord = recordResult.rows[0];

    // PostgreSQL JSONB is automatically parsed by node-postgres
    // No need to JSON.parse - it's already an object
    const productionRecord: ProductionRecord = {
      ...rawRecord,
      sources: rawRecord.sources, // Already parsed by pg driver
    };

    // Generate nodes + edges with dagre layout
    const { nodes, edges } = buildGraph(productionRecord);

    const response: ProductFlowResponse = {
      productId: productionRecord.product_id,
      productName: productionRecord.product_name,
      workCenter: productionRecord.work_center,
      date: productionRecord.date,
      productionQty: productionRecord.production_qty,
      productionUom: productionRecord.production_uom,
      nodes,
      edges,
      availableMonths,
      selectedYear,
      selectedMonth,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch Shakambhari product flow:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
