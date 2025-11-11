import { createLoopMessageClient } from "@poppy/clients/loop-message";
import type { WorkerEnv } from "../context";

export function createLoopClient(env: WorkerEnv) {
  return createLoopMessageClient({
    authorizationKey: env.LOOP_AUTHORIZATION_KEY,
    secretKey: env.LOOP_SECRET_KEY,
  });
}
