import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import Redis from "ioredis";
import { env } from "../env";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (server: FastifyInstance) => {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  // Handle Redis connection errors
  redis.on("error", (err) => {
    server.log.error({ err }, "Redis connection error");
  });

  redis.on("connect", () => {
    server.log.info("Redis client connected");
  });

  redis.on("ready", () => {
    server.log.info("Redis client ready");
  });

  redis.on("close", () => {
    server.log.warn("Redis connection closed");
  });

  redis.on("reconnecting", () => {
    server.log.info("Redis client reconnecting");
  });

  // Decorate fastify instance with redis client
  server.decorate("redis", redis);

  // Graceful shutdown
  server.addHook("onClose", async (instance) => {
    instance.log.info("Closing Redis connection");
    await redis.quit();
  });
};

export default fp(redisPlugin, {
  name: "redis",
});