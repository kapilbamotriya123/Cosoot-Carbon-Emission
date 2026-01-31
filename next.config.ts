import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads (routing BOM files can be 25-30MB).
  // App Router route handlers don't have a per-route bodyParser config like Pages Router,
  // so we set this globally. Only the routing upload handles large files.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // This is the actual limit that matters for route handlers (API routes).
    // Next.js runs a proxy in front of route handlers and buffers the request body.
    // Default is 10MB — we raise it to 50MB for large BOM Excel files.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
