import { Request, Response, NextFunction } from 'express';

const REDACTED_KEYS = new Set([
  'password',
  'secret',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'authorization',
  'token',
  'service_role_key',
]);

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      cleaned[k] = '[REDACTED]';
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
      })
    );
  },

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
      })
    );
  },

  error(message: string, meta?: Record<string, unknown>) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
      })
    );
  },
};

export function httpRequestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration_ms: durationMs,
    });
  });
  next();
}
