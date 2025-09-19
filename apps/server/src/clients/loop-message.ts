import { createLoopMessageClient } from "@poppy/clients/loop-message";
import { env } from "../env";

export const loopClient = createLoopMessageClient({
  authorizationKey: env.LOOP_AUTHORIZATION_KEY,
  secretKey: env.LOOP_SECRET_KEY,
});
