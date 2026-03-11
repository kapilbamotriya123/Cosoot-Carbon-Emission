import { Storage } from "@google-cloud/storage";

// GCP authentication: supports two methods:
// 1. GCP_SERVICE_ACCOUNT_KEY_JSON — the full JSON string (for prod/cloud deployments)
// 2. GCP_SERVICE_ACCOUNT_KEY_PATH — path to a JSON file on disk (for local dev)
function createStorage() {
  const jsonKey = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  if (jsonKey) {
    return new Storage({ credentials: JSON.parse(jsonKey) });
  }
  return new Storage({ keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY_PATH });
}

const storage = createStorage();

const bucketName = process.env.GCP_BUCKET_NAME!;

/**
 * Uploads a file buffer to GCP Cloud Storage.
 *
 * @param buffer - The file contents as a Buffer
 * @param destination - The path in the bucket, e.g. "routing/meta_engitech_pune/2026-01-30.xlsx"
 * @returns The public URL of the uploaded file
 *
 * We organize files by: {type}/{company_slug}/{date}.xlsx
 * This makes it easy to find a company's uploads in the bucket.
 */
export async function uploadToGCS(
  buffer: Buffer,
  destination: string
): Promise<string> {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destination);

  await file.save(buffer, {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return `gs://${bucketName}/${destination}`;
}

/**
 * Generates a signed download URL for a file in GCS.
 * The URL expires after 15 minutes — enough time for a download.
 *
 * @param gcsUrl - The gs:// URL stored in file_uploads.file_url
 * @returns A temporary HTTPS URL that the browser can download directly
 */
export async function getSignedDownloadUrl(gcsUrl: string): Promise<string> {
  // Extract the path from gs://bucket-name/path/to/file
  const path = gcsUrl.replace(`gs://${bucketName}/`, "");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  });

  return url;
}

/**
 * Formats a date as "25-Feb-2026" — clean, readable, filesystem-safe.
 * Used for GCS file paths and display names.
 */
export function formatUploadDate(date: Date = new Date()): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}
