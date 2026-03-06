import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { getSignedDownloadUrl } from "@/lib/storage";

// GET /api/uploads/download?id=123
//
// Generates a signed download URL for a previously uploaded file.
// The signed URL expires after 15 minutes.

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    await initializeSchema();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id param is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT file_url, file_name FROM file_uploads WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Upload not found" },
        { status: 404 }
      );
    }

    const { file_url, file_name } = result.rows[0];
    const downloadUrl = await getSignedDownloadUrl(file_url);

    return NextResponse.json({ downloadUrl, fileName: file_name });
  } catch (error) {
    console.error("Failed to generate download URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
