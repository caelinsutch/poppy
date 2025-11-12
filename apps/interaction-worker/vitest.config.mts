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
          compatibilityFlags: [
            "nodejs_compat",
            "enable_nodejs_tty_module",
            "enable_nodejs_fs_module",
            "enable_nodejs_http_modules",
          ],
          bindings: {
            NODE_ENV: "test",
            DATABASE_URL:
              process.env.DATABASE_URL ||
              "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
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
