import fastify from "fastify";
import { env } from "./env";
import { loopMessageRoutes } from "./routes/loop-message";

const server = fastify({
  logger: true,
});

// Track active connections for debugging
let activeConnections = 0;
let totalRequests = 0;

// Memory usage monitoring
const logMemoryUsage = () => {
  const usage = process.memoryUsage();
  server.log.info({
    memory: {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    },
    activeConnections,
    totalRequests,
    uptime: `${Math.round(process.uptime())}s`,
  });
};

// Log memory usage every 60 seconds
const memoryMonitorInterval = setInterval(logMemoryUsage, 60000);

// Fastify error handler
server.setErrorHandler((error, request, reply) => {
  request.log.error({
    err: error,
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: env.NODE_ENV === "production" ? "Internal Server Error" : error.message,
    statusCode,
  });
});

// Track request lifecycle
server.addHook("onRequest", async (request, _reply) => {
  activeConnections++;
  totalRequests++;
  request.log.info({ msg: "Request received", activeConnections, totalRequests });
});

server.addHook("onResponse", async (request, reply) => {
  activeConnections--;
  request.log.info({
    msg: "Request completed",
    statusCode: reply.statusCode,
    activeConnections,
  });
});

server.get("/", async (_request, _reply) => {
  return { hello: "world" };
});

server.get("/health", async (_request, _reply) => {
  const usage = process.memoryUsage();
  return {
    status: "ok",
    uptime: process.uptime(),
    memory: {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
    },
    activeConnections,
    totalRequests,
  };
});

server.register(loopMessageRoutes);

// Global error handlers
process.on("uncaughtException", (error: Error) => {
  console.error("💥 UNCAUGHT EXCEPTION - Server will exit:", {
    error: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString(),
  });
  server.log.error({ err: error, event: "uncaughtException" });

  // Log final state before exit
  logMemoryUsage();

  // Give time for logs to flush
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  console.error("💥 UNHANDLED REJECTION - Promise rejected:", {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });
  server.log.error({ reason, event: "unhandledRejection" });

  // Log memory state when rejection occurs
  logMemoryUsage();
});

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
  server.log.info({ signal, event: "shutdown_initiated" });

  // Stop accepting new connections
  clearInterval(memoryMonitorInterval);

  try {
    // Log final stats
    logMemoryUsage();

    await server.close();
    console.log("✅ Server closed successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Process event logging
process.on("exit", (code) => {
  console.log(`🚪 Process exit with code: ${code}`);
});

process.on("warning", (warning) => {
  console.warn("⚠️  Process warning:", {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

const start = async () => {
  try {
    const port = env.PORT;
    const host = env.HOST;

    await server.listen({ port, host });
    console.log(`✅ Server listening on http://${host}:${port}`);
    console.log(`📊 Environment: ${env.NODE_ENV}`);
    console.log(`🔍 Process ID: ${process.pid}`);

    // Log initial memory state
    logMemoryUsage();
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    server.log.error(err);
    process.exit(1);
  }
};

start();
