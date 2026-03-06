import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { initializeSchema } from "@/lib/schema";
import { triggerEmissionCalculation } from "@/lib/emissions/engine";

// POST /api/emissions/calculate
//
// Manual trigger for emission calculation (or recalculation).
// Unlike the auto-trigger in consumption upload, this is synchronous —
// the response waits for calculation to complete.
//
// Body: { companySlug: string, year: number, month: number }

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

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

    const result = await triggerEmissionCalculation(companySlug, year, month);

    return NextResponse.json({
      message: `Emission calculation complete for ${companySlug} ${month}/${year}`,
      ...result,
    });
  } catch (error) {
    console.error("Emission calculation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
