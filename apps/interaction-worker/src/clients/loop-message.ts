import { env } from "cloudflare:workers";
import { createLoopMessageClient } from "@poppy/clients/loop-message";

export const loopClient = createLoopMessageClient({
  authorizationKey: env.LOOP_AUTHORIZATION_KEY,
  secretKey: env.LOOP_SECRET_KEY,
});
