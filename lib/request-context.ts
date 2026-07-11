import { createDb, type Db } from "@/db";
import { createAuth, type Auth } from "@/lib/auth";

// Local/Vercel-style dev reads DATABASE_URL directly. Once deployed to
// Cloudflare Workers, this becomes the Hyperdrive binding's connectionString
// instead -- construct fresh per call either way, never cache the result,
// since a cached client would be a live connection reused across requests
// (the exact anti-pattern Workers' per-request I/O isolation forbids).
function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return connectionString;
}

export function getRequestContext(): { db: Db; auth: Auth } {
  const db = createDb(getConnectionString());
  const auth = createAuth(db);
  return { db, auth };
}
