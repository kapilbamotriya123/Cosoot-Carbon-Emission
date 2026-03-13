import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CN_CODES } from "@/lib/reports/cn-codes";

// GET /api/reports/cn-codes?category=Alloys+...
// Returns all CN codes, optionally filtered by category.
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const category = request.nextUrl.searchParams.get("category");

  const codes = category
    ? CN_CODES.filter((c) => c.category === category)
    : CN_CODES;

  return NextResponse.json({ success: true, data: codes });
}
