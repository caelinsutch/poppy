/* eslint-disable @typescript-eslint/consistent-type-imports */
type LocalEnv = import("./src/context").WorkerEnv;

// Add Env to Cloudflare namespace so that we can access it via
declare namespace Cloudflare {
  interface Env extends LocalEnv {}
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends LocalEnv {}
}
