import type { Context, NotFoundHandler } from "hono";

/**
 * Creates a 404 not found handler for Hono apps
 */
export function withNotFound<E extends object>(): NotFoundHandler<E> {
  return (c: Context<E>) => {
    return c.json(
      {
        error: "Not Found",
        message: `Route ${c.req.method} ${c.req.path} not found`,
        statusCode: 404,
      },
      404,
    );
  };
}
