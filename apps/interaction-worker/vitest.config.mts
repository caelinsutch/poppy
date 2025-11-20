import { resolve } from "node:path";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { config } from "dotenv";

// Load .env file from the interaction-worker directory
config({ path: resolve(__dirname, ".env") });

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
            EXASEARCH_API_KEY:
              process.env.EXASEARCH_API_KEY || "mock-exa-api-key",
            OPENROUTER_API_KEY:
              process.env.OPENROUTER_API_KEY || "mock-openrouter-api-key",
            NODE_ENV: "test",
            DATABASE_URL:
              process.env.DATABASE_URL ||
              "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          },
          durableObjects: {
            MESSAGE_DEBOUNCER: "MessageDebouncer",
            EXECUTION_AGENT: {
              className: "ExecutionAgent",
              scriptPath: resolve(
                __dirname,
                "../execution-worker/src/index.ts",
              ),
            },
          },
          serviceBindings: {
            EXECUTION_WORKER: {
              scriptPath: resolve(
                __dirname,
                "../execution-worker/src/index.ts",
              ),
            },
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
