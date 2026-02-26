import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { initializeSchema } from "@/lib/schema";

// GET /api/uploads
//
// Returns upload history for a given company and upload type.
// Params:
//   - company (required): company slug
//   - type (required): 'routing' | 'consumption' | 'production' | 'constants'
//   - limit (optional): max records to return, default 20

export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    const { searchParams } = new URL(request.url);
    const company = searchParams.get("company");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!company || !type) {
      return NextResponse.json(
        { error: "company and type params are required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT id, file_name, file_url, file_size_bytes, year, month, quarter,
              status, metadata, uploaded_at
       FROM file_uploads
       WHERE company_slug = $1 AND upload_type = $2
       ORDER BY uploaded_at DESC
       LIMIT $3`,
      [company, type, limit]
    );

    return NextResponse.json({
      uploads: result.rows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        fileUrl: row.file_url,
        fileSizeBytes: row.file_size_bytes,
        year: row.year,
        month: row.month,
        quarter: row.quarter,
        status: row.status,
        metadata: row.metadata,
        uploadedAt: row.uploaded_at,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch upload history:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload history" },
      { status: 500 }
    );
  }
}
