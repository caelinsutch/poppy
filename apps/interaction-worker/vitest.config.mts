import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
  test: {
    poolOptions: {
      workers: {
        remoteBindings: true,
        singleWorker: true,
        wrangler: {
          environment: "staging",
          configPath: `${__dirname}/wrangler.jsonc`,
        },
        miniflare: {
          bindings: {
            NODE_ENV: "test",
            DATABASE_URL:
              process.env.DATABASE_URL ||
              "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
            EXASEARCH_API_KEY: "mock-exa-api-key",
            OPENROUTER_API_KEY: "mock-openrouter-api-key",
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
