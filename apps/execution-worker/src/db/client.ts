import { getDb } from "@poppy/db";
import type { WorkerEnv } from "../context";

/**
 * Creates a Drizzle database client using Hyperdrive connection
 * @param env - Cloudflare Workers environment with Hyperdrive binding
 * @returns Drizzle database instance with all schemas
 */
export function createDatabaseClient(env: WorkerEnv) {
  return getDb(env.HYPERDRIVE.connectionString);
}

/**
 * Type helper for database client
 */
export type Database = ReturnType<typeof createDatabaseClient>;
