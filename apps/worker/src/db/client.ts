import { getDb } from "@poppy/db";

/**
 * Creates a Drizzle database client using Hyperdrive connection
 * @param env - Cloudflare Workers environment with Hyperdrive binding
 * @returns Drizzle database instance with all schemas
 */
export function createDatabaseClient(env: Env) {
  // Use Hyperdrive connection string for optimized PostgreSQL access
  return getDb(env.HYPERDRIVE.connectionString);
}

/**
 * Type helper for database client
 */
export type Database = ReturnType<typeof createDatabaseClient>;
