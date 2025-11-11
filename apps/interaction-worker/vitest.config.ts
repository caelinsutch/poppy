import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

console.log(process.env.DATABASE_URL);

export default defineWorkersProject({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: `${__dirname}/wrangler.jsonc` },
        miniflare: {
          bindings: {
            ENVIRONMENT: "VITEST",
          },
          durableObjects: {
            MESSAGE_DEBOUNCER: "MessageDebouncer",
          },
          hyperdrives: {
            HYPERDRIVE:
              process.env.DATABASE_URL ||
              "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          },
        },
      },
    },
  },
});
