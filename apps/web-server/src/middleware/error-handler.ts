import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { config } from '../config.js';

/**
 * Custom error class with status code
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Create common HTTP errors
 */
export const errors = {
  badRequest: (message = 'Bad request', details?: unknown) =>
    new HttpError(400, message, details),

  unauthorized: (message = 'Unauthorized') =>
    new HttpError(401, message),

  forbidden: (message = 'Forbidden') =>
    new HttpError(403, message),

  notFound: (message = 'Not found') =>
    new HttpError(404, message),

  conflict: (message = 'Conflict', details?: unknown) =>
    new HttpError(409, message, details),

  internal: (message = 'Internal server error', details?: unknown) =>
    new HttpError(500, message, details),
};

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error | HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error
  console.error('[Error]', err);

  // Determine status code and message
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown = undefined;

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // JSON parse error
    statusCode = 400;
    message = 'Invalid JSON in request body';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  // In development, include stack trace
  if (config.isDev && err.stack) {
    const existingDetails = (typeof details === 'object' && details !== null) ? details : {};
    details = { ...existingDetails, stack: err.stack };
  }

  const response: { success: false; error: string; details?: unknown } = {
    success: false,
    error: message,
  };

  if (details !== undefined) {
    response.details = details;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}
