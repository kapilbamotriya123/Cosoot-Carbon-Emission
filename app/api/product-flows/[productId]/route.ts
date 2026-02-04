import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import type { RoutingData } from "@/lib/parsers/types";
import { buildGraph, buildFuelProfile } from "@/lib/product-flows/build-graph";
import type { ProductFlowResponse } from "@/lib/product-flows/types";

// GET /api/product-flows/[productId]?companySlug=...&year=...&month=...
//
// Returns React Flow nodes + edges for a single product's manufacturing route.
// Uses consumption data for a specific month/year to determine fuel usage.
// Also returns the list of available months so the frontend can render a selector.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    await initializeSchema();

    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug");
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!companySlug) {
      return NextResponse.json(
        { error: "companySlug is required" },
        { status: 400 }
      );
    }

    // Fetch routing data + available months in parallel
    const [routingResult, monthsResult] = await Promise.all([
      pool.query(`SELECT data FROM routing_data WHERE company_slug = $1`, [
        companySlug,
      ]),
      pool.query(
        `SELECT year, month FROM consumption_data WHERE company_slug = $1 ORDER BY year DESC, month DESC`,
        [companySlug]
      ),
    ]);

    if (routingResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No routing data found for this company" },
        { status: 404 }
      );
    }

    // Build available months list
    const availableMonths: { year: number; month: number }[] =
      monthsResult.rows.map((r) => ({ year: r.year, month: r.month }));

    // Determine which month to use: explicit params or latest available
    let selectedYear: number | null = null;
    let selectedMonth: number | null = null;

    if (yearParam && monthParam) {
      selectedYear = parseInt(yearParam);
      selectedMonth = parseInt(monthParam);
    } else if (availableMonths.length > 0) {
      selectedYear = availableMonths[0].year;
      selectedMonth = availableMonths[0].month;
    }

    // Find the specific product in the routing data
    const routingData = routingResult.rows[0].data as RoutingData;
    const product = routingData.products.find(
      (p) => p.productId === productId
    );

    if (!product) {
      return NextResponse.json(
        { error: `Product ${productId} not found in routing data` },
        { status: 404 }
      );
    }

    // Fetch consumption and emission intensities for the selected month
    let fuelProfile = new Map();
    const emissionIntensities = new Map<
      string,
      { electricity: number; lpg: number; diesel: number }
    >();

    if (selectedYear !== null && selectedMonth !== null) {
      const [consumptionResult, intensitiesResult] = await Promise.all([
        pool.query(
          `SELECT data FROM consumption_data WHERE company_slug = $1 AND year = $2 AND month = $3`,
          [companySlug, selectedYear, selectedMonth]
        ),
        pool.query(
          `SELECT work_center, electricity_intensity, lpg_intensity, diesel_intensity
           FROM emission_by_process_meta_engitech
           WHERE company_slug = $1 AND year = $2 AND month = $3`,
          [companySlug, selectedYear, selectedMonth]
        ),
      ]);

      if (consumptionResult.rows.length > 0) {
        fuelProfile = buildFuelProfile([consumptionResult.rows[0].data]);
      }

      // Build emission intensities map (in tCO2e per unit)
      for (const row of intensitiesResult.rows) {
        emissionIntensities.set(row.work_center, {
          electricity: parseFloat(row.electricity_intensity) || 0,
          lpg: parseFloat(row.lpg_intensity) || 0,
          diesel: parseFloat(row.diesel_intensity) || 0,
        });
      }
    }

    // Generate nodes + edges with dagre layout
    const { nodes, edges } = buildGraph(
      product,
      fuelProfile,
      emissionIntensities
    );

    const response: ProductFlowResponse = {
      productId,
      nodes,
      edges,
      availableMonths,
      selectedYear,
      selectedMonth,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch product flow:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
