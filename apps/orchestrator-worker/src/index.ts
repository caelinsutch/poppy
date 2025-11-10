import {
  useWorkersLogger,
  withDefaultCors,
  withNotFound,
  withOnError,
} from "@poppy/hono-helpers";
import { Hono } from "hono";
import type { App } from "./context";
import { loopMessageRoutes } from "./routes/loop-message";

// Export Durable Object
export { MessageDebouncer } from "./durable-objects/message-debouncer";

const app = new Hono<App>();

// Middleware
app.use("*", useWorkersLogger());
app.use("*", withDefaultCors());

// Health check routes
app.get("/", (c) => {
  return c.json({ hello: "world" });
});

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Register routes
app.route("/", loopMessageRoutes);

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

export default app;
