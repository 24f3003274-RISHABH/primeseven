import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from '../utils/errors.ts';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
        .join('; ');
      next(new BadRequestError(msg || 'Invalid request payload.'));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.baseUrl}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now > existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait before retrying.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
}
