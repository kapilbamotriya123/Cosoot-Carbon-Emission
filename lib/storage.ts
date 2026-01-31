import { Storage } from "@google-cloud/storage";

// GCP authenticates via a service account key file.
// The key file is a JSON containing the service account's credentials.
// We point to it via an env var so the credentials never end up in code.
const storage = new Storage({
  keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY_PATH,
});

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
