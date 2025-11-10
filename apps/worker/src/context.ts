import type { SharedHonoEnv, SharedHonoVariables } from "@poppy/hono-helpers";
import type { MessageDebouncer } from "./durable-objects/message-debouncer";

// Worker context and environment types

// Re-export the Env from the global Cloudflare namespace with proper DO typing
export type WorkerEnv = SharedHonoEnv &
  Env & {
    MESSAGE_DEBOUNCER: DurableObjectNamespace<MessageDebouncer>;
  };

export type Variables = SharedHonoVariables;

export interface App {
  Bindings: WorkerEnv;
  Variables: Variables;
}
