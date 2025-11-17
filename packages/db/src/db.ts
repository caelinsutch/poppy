import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Create a Drizzle database client
 * @param connectionString - PostgreSQL connection string
 * @returns Drizzle database instance
 */
export function getDb(connectionString?: string) {
  const connStr = connectionString;

  if (!connStr) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connStr, { prepare: false });
  return drizzle(client, { schema });
}
