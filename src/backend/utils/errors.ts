import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.ts';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 400,
    code = 'BAD_REQUEST',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required. Please sign in to continue.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied.', details?: Record<string, unknown>) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
  }
}

export function asyncHandler(
  fn: (req: any, res: Response, next: NextFunction) => Promise<any> | any
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function centralErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details || {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    res.status(400).json({
      error: message || 'Request validation failed.',
      code: 'VALIDATION_ERROR',
      issues: err.issues,
    });
    return;
  }

  logger.error('Unhandled backend error', {
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    error: 'An unexpected internal server error occurred. Please try again.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
