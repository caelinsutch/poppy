import { getDb } from "@poppy/db";
import type { WorkerEnv } from "../context";

/**
 * Creates a Drizzle database client using Hyperdrive connection
 * @param env - Cloudflare Workers environment with Hyperdrive binding
 * @returns Drizzle database instance with all schemas
 */
export function createDatabaseClient(env: WorkerEnv) {
  const isTest = env.NODE_ENV === "test";
  console.log(env);
  // Use Hyperdrive connection string for optimized PostgreSQL access
  return getDb(
    isTest ? process.env.DATABASE_URL : env.HYPERDRIVE.connectionString,
  );
}

/**
 * Type helper for database client
 */
export type Database = ReturnType<typeof createDatabaseClient>;
