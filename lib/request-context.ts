import { createDb, type Db } from "@/db";
import { createAuth, type Auth } from "@/lib/auth";

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return connectionString;
}

// Cached per warm serverless instance and reused across requests -- unlike
// Cloudflare Workers, Vercel's Node.js runtime allows module-scoped state to
// persist across invocations on the same instance, and creating a fresh
// connection pool per request exhausts Supabase's pooler connection cap
// under any real concurrency.
let cached: { db: Db; auth: Auth } | undefined;

export function getRequestContext(): { db: Db; auth: Auth } {
  if (!cached) {
    const db = createDb(getConnectionString());
    const auth = createAuth(db);
    cached = { db, auth };
  }
  return cached;
}
