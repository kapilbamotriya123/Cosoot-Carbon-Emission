import { Pool } from "pg";

// Connection pooling: Instead of opening a new database connection for every
// request (expensive — involves TCP handshake, auth, etc.), we reuse a "pool"
// of connections. The pool manages opening/closing connections for us.
//
// Why a singleton? In development, Next.js hot-reloads modules frequently.
// Without this pattern, each reload would create a NEW pool, leaking connections
// until PostgreSQL hits its max connection limit and refuses new ones.
// We store the pool on `globalThis` so it survives hot reloads.

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Max 10 connections in the pool. For ~30 users this is plenty.
    // GCP Cloud SQL free/small instances typically allow 25-100 connections.
    max: 10,
    ssl: {
      // rejectUnauthorized: false means "use SSL encryption but don't verify
      // the server's certificate." This is fine for development because:
      //   - The connection is still encrypted (data in transit is safe)
      //   - We just skip verifying the server is who it claims to be
      // For production, you'd download GCP's server CA cert and set it here
      // to get full verification (prevents man-in-the-middle attacks).
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}
