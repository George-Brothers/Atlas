/**
 * Drizzle database client backed by the Neon serverless (HTTP) driver.
 *
 * The client is created lazily: importing this module never touches
 * `DATABASE_URL`, so the app builds and the auth gate runs even when no
 * database is provisioned yet (Phase 0 ships no code that queries the DB).
 * The first actual use throws a clear error if `DATABASE_URL` is missing.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | undefined;

export function getDb(): Database {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Provision Neon Postgres and set DATABASE_URL before querying the database.",
      );
    }
    const sql = neon(url);
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export { schema };
