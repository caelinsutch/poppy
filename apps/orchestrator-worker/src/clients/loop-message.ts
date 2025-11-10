import { createLoopMessageClient } from "@poppy/clients/loop-message";

export function createLoopClient(env: Env) {
  return createLoopMessageClient({
    authorizationKey: env.LOOP_AUTHORIZATION_KEY,
    secretKey: env.LOOP_SECRET_KEY,
  });
}
