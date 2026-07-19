import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * `drizzle-kit generate` (schema -> SQL) needs only `schema` + `dialect` and
 * runs without a live database. `drizzle-kit push`/`migrate` additionally need
 * `DATABASE_URL`, which the owner sets after provisioning Neon post-merge.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only consumed by push/migrate; generate ignores it. Empty string keeps
    // the config valid when DATABASE_URL is not present in the environment.
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
