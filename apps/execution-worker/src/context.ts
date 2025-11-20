import type { SharedHonoEnv, SharedHonoVariables } from "@poppy/hono-helpers";
import type { ExecutionAgent } from "./durable-objects/execution-agent";

// Worker context and environment types

// Re-export the Env from the global Cloudflare namespace with proper DO typing
export type WorkerEnv = SharedHonoEnv &
  Cloudflare.Env & {
    EXECUTION_AGENT: DurableObjectNamespace<ExecutionAgent>;
    HYPERDRIVE: Hyperdrive;
    INTERACTION_WORKER: Fetcher;
  };

export type Variables = SharedHonoVariables;

export interface App {
  Bindings: WorkerEnv;
  Variables: Variables;
}
