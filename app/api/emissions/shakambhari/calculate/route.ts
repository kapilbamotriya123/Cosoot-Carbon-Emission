import { NextRequest, NextResponse } from "next/server";
import { initializeSchema } from "@/lib/schema";
import { triggerShakambhariEmissionCalculation } from "@/lib/emissions/shakambhari/engine";

// POST /api/emissions/shakambhari/calculate
//
// Manual trigger for Shakambhari emission calculation.
// Calculates all products for a given month from production_data_shakambhari.
//
// Body: { companySlug: string, year: number, month: number }

export async function POST(request: NextRequest) {
  // const { userId } = await auth();
  // if (!userId) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  try {
    await initializeSchema();

    const body = await request.json();
    const { companySlug, year, month } = body;

    if (!companySlug || !year || !month) {
      return NextResponse.json(
        { error: "companySlug, year, and month are required" },
        { status: 400 }
      );
    }

    const result = await triggerShakambhariEmissionCalculation(
      companySlug,
      year,
      month
    );

    return NextResponse.json({
      message: `Shakambhari emission calculation complete for ${companySlug} ${month}/${year}`,
      resultCount: result.resultCount,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Shakambhari emission calculation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
