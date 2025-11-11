import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: `${__dirname}/wrangler.jsonc` },
        miniflare: {
          bindings: {
            ENVIRONMENT: "VITEST",
            // Mock HYPERDRIVE binding with a test connection string
            HYPERDRIVE: {
              connectionString:
                process.env.DATABASE_URL ||
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
            },
          },
          durableObjects: {
            MESSAGE_DEBOUNCER: "MessageDebouncer",
          },
        },
      },
    },
  },
});
