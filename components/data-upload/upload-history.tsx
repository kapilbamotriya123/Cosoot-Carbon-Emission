"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";

interface UploadRecord {
  id: number;
  fileName: string;
  fileSizeBytes: number | null;
  year: number | null;
  month: number | null;
  quarter: number | null;
  metadata: Record<string, unknown>;
  uploadedAt: string;
}

interface Props {
  company: string;
  uploadType: string; // 'routing' | 'consumption' | 'production' | 'constants'
  refreshKey?: number; // Increment to trigger a refetch
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadHistory({ company, uploadType, refreshKey }: Props) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/uploads?company=${company}&type=${uploadType}&limit=20`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUploads(data.uploads);
    } catch {
      setUploads([]);
    } finally {
      setLoading(false);
    }
  }, [company, uploadType]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads, refreshKey]);

  async function handleDownload(uploadId: number) {
    setDownloadingId(uploadId);
    try {
      const res = await fetch(`/api/uploads/download?id=${uploadId}`);
      if (!res.ok) throw new Error("Failed to generate download URL");
      const data = await res.json();

      // Open the signed URL in a new tab to trigger download
      window.open(data.downloadUrl, "_blank");
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading upload history...
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No uploads yet for this data type.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium mb-2">Upload History</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Upload Date</TableHead>
              <TableHead className="w-[100px]">Period</TableHead>
              <TableHead className="w-[80px]">Size</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.map((upload) => (
              <TableRow key={upload.id}>
                <TableCell className="text-sm">
                  {upload.fileName}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {upload.year && upload.month
                    ? `${upload.month}/${upload.year}`
                    : upload.year && upload.quarter
                      ? `Q${upload.quarter} ${upload.year}`
                      : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatFileSize(upload.fileSizeBytes)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(upload.id)}
                    disabled={downloadingId === upload.id}
                  >
                    {downloadingId === upload.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
