import fastify from "fastify";
import { env } from "./env";
import { loopMessageRoutes } from "./routes/loop-message";

const server = fastify({
  logger: true,
});

server.get("/", async (_request, _reply) => {
  return { hello: "world" };
});

server.get("/health", async (_request, _reply) => {
  return { status: "ok" };
});

server.register(loopMessageRoutes);

const start = async () => {
  try {
    const port = env.PORT;
    const host = env.HOST;

    await server.listen({ port, host });
    console.log(`Server listening on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
