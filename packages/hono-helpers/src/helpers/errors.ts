/**
 * Custom error classes for better error handling
 */

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad Request", details?: any) {
    super(400, message, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", details?: any) {
    super(401, message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", details?: any) {
    super(403, message, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not Found", details?: any) {
    super(404, message, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Validation Error", details?: any) {
    super(422, message, details);
    this.name = "ValidationError";
  }
}

export class InternalServerError extends HttpError {
  constructor(message = "Internal Server Error", details?: any) {
    super(500, message, details);
    this.name = "InternalServerError";
  }
}
