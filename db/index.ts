import "./envConfig";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "5", 10),
    fetch_types: false,
    // Supabase's transaction-mode pooler doesn't support protocol-level
    // prepared statements across pooled connections.
    prepare: false,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
