import { z } from "zod";

export type WorkersEnvironment = z.infer<typeof WorkersEnvironment>;
export const WorkersEnvironment = z.enum([
  "VITEST",
  "development",
  "staging",
  "production",
]);

/** Global bindings */
export type SharedHonoEnv = {
  /**
   * Name of the worker used in logging/etc.
   * Automatically pulled from package.json
   */
  NAME: string;
  /**
   * Node environment
   */
  NODE_ENV: WorkersEnvironment;
  /**
   * Optional Sentry release version for logging
   */
  SENTRY_RELEASE?: string;
};
/** Global Hono variables */
export type SharedHonoVariables = {
  // Things like Sentry, etc. that should be present on all Workers
};

/** Top-level Hono app */
export interface HonoApp {
  Variables: SharedHonoVariables;
  Bindings: SharedHonoEnv;
}

/** Context used for non-Hono things like Durable Objects */
export type SharedAppContext = {
  var: SharedHonoVariables;
  env: SharedHonoEnv;
  executionCtx: Pick<ExecutionContext, "waitUntil">;
};
