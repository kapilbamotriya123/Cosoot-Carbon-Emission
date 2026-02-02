import { NextResponse } from "next/server";
import { initializeSchema } from "@/lib/schema";

// POST /api/setup — Creates database tables if they don't exist.
// This is a one-time setup endpoint. In production, you'd typically
// use a migration tool (like node-pg-migrate), but for our scale
// and schemaless approach, this is fine.
export async function POST() {
  try {
    await initializeSchema();
    return NextResponse.json({ message: "Schema initialized successfully" });
  } catch (error) {
    console.error("Schema initialization failed:", error);
    return NextResponse.json(
      { error: "Failed to initialize schema" },
      { status: 500 }
    );
  }
}
