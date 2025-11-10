import type { Context, ErrorHandler } from "hono";

/**
 * Creates a global error handler middleware for Hono apps
 * Provides environment-aware error messages and logging
 */
export function withOnError<
  E extends { Bindings: { NODE_ENV?: string } },
>(): ErrorHandler<E> {
  return (err: Error, c: Context<E>) => {
    console.error("Error handler caught:", {
      error: err.message,
      stack: err.stack,
      url: c.req.url,
      method: c.req.method,
    });

    const statusCode = (err as any).statusCode || 500;
    const isDevelopment = c.env.NODE_ENV === "development";

    return c.json(
      {
        error: isDevelopment ? err.message : "Internal Server Error",
        statusCode,
        ...(isDevelopment && { stack: err.stack }),
      },
      statusCode,
    );
  };
}
