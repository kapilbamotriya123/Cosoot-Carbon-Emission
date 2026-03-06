import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { buildGraph } from "@/lib/product-flows-shakambhari/build-graph";
import type {
  ProductFlowResponse,
  ProductionRecord,
  SourceMaterial,
} from "@/lib/product-flows-shakambhari/types";

// GET /api/product-flows-shakambhari/[productId]?companySlug=shakambhari&year=2025&month=2
//
// Returns React Flow nodes + edges for a single product's flow.
// Aggregates ALL occurrences of the product in the selected month.
// Structure: Input materials → Work center → Main product + Byproducts

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

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

    // Fetch ALL occurrences of this product and emission data in the selected month
    const [recordsResult, emissionsResult] = await Promise.all([
      pool.query(
        `
        SELECT *
        FROM production_data_shakambhari
        WHERE company_slug = $1 AND product_id = $2 AND year = $3 AND month = $4
        ORDER BY date ASC, work_center ASC
        `,
        [companySlug, productId, selectedYear, selectedMonth]
      ),
      pool.query(
        `
        SELECT source_breakdowns
        FROM emission_results_shakambhari
        WHERE company_slug = $1 AND product_id = $2 AND year = $3 AND month = $4
        `,
        [companySlug, productId, selectedYear, selectedMonth]
      ),
    ]);

    if (recordsResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: `No production data found for ${productId} in ${selectedYear}-${selectedMonth}`,
        },
        { status: 404 }
      );
    }

    // Get the first record for basic info (earliest date)
    const firstRecord = recordsResult.rows[0];
    const totalRecords = recordsResult.rows.length;

    // Build emission map from emission_results_shakambhari
    const emissionMap = new Map<string, number>();
    for (const emissionRow of emissionsResult.rows) {
      const breakdowns = emissionRow.source_breakdowns as Array<{
        compMat: string;
        co2e: number;
      }>;
      for (const breakdown of breakdowns) {
        const existing = emissionMap.get(breakdown.compMat) || 0;
        emissionMap.set(breakdown.compMat, existing + breakdown.co2e);
      }
    }

    // Aggregate all production quantities and source materials
    let totalProductionQty = 0;
    const aggregatedSources = new Map<
      string,
      {
        compMat: string;
        compName: string;
        compUom: string;
        consumedQty: number;
        consumedVal: number;
        byproductQty: number;
        byproductVal: number;
        co2e?: number;
      }
    >();

    for (const row of recordsResult.rows) {
      totalProductionQty += parseFloat(row.production_qty) || 0;

      // Aggregate sources
      const sources = row.sources as SourceMaterial[];
      for (const src of sources) {
        const existing = aggregatedSources.get(src.compMat);
        if (existing) {
          existing.consumedQty += src.consumedQty;
          existing.consumedVal += src.consumedVal;
          existing.byproductQty += src.byproductQty;
          existing.byproductVal += src.byproductVal;
        } else {
          aggregatedSources.set(src.compMat, {
            ...src,
            co2e: emissionMap.get(src.compMat),
          });
        }
      }
    }

    // Build aggregated production record
    const productionRecord: ProductionRecord = {
      ...firstRecord,
      production_qty: totalProductionQty,
      sources: Array.from(aggregatedSources.values()),
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
      totalRecords, // Number of production runs aggregated
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
