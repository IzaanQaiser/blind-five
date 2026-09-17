import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionUrl = new URL(process.env.DATABASE_URL);

// node-postgres 8.23+ verifies certificates for sslmode=require by default,
// while Postgres/libpq (and Supabase's documented URI) use `require` to mean
// encrypted without CA verification. Opt into libpq-compatible semantics so
// Supabase's shared pooler works without bundling its CA certificate.
if (
  connectionUrl.searchParams.get("sslmode") === "require" &&
  !connectionUrl.searchParams.has("uselibpqcompat")
) {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
}

export const pool = new Pool({ connectionString: connectionUrl.toString() });
export const db = drizzle(pool, { schema });

export * from "./schema";
