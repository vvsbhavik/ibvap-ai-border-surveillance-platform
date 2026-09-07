// ============================================================================
// IBVAP Security Headers, Rate Limiting & Input Validation Middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { globalCache } from '../../storage/redis-adapter';
import { logger } from '../logger';

/**
 * Enterprise security response headers.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
}

/**
 * Sliding window or counter-based rate limiter middleware for sensitive endpoints.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const windowKey = Math.floor(Date.now() / options.windowMs);
      const cacheKey = `ratelimit:${options.keyPrefix}:${clientIp}:${windowKey}`;

      const currentCount = await globalCache.incr(cacheKey);
      if (currentCount === 1) {
        // Set TTL equal to window
        await globalCache.set(cacheKey, '1', Math.ceil(options.windowMs / 1000) * 2);
      }

      res.setHeader('X-RateLimit-Limit', options.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - currentCount).toString());

      if (currentCount > options.maxRequests) {
        res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000).toString());
        res.status(429).json({
          success: false,
          error: 'Too many requests. Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: Math.ceil(options.windowMs / 1000),
        });
        return;
      }

      next();
    } catch (err) {
      // If rate limiter fails, fail open but log warning
      logger.warn('Rate limiter check error, failing open', { error: String(err) });
      next();
    }
  };
}

/**
 * Input Validation & Sanitization Helpers
 */
export const InputValidator = {
  isValidId(id: unknown): boolean {
    if (typeof id !== 'string') return false;
    const trimmed = id.trim();
    // Allow standard UUID or prefixed format e.g. cam-01, inc-123456, usr-001
    return trimmed.length >= 3 && trimmed.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(trimmed);
  },

  isValidCoordinates(lat: number, lng: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  },

  isValidSeverity(sev: unknown): boolean {
    return (
      typeof sev === 'string' &&
      ['INFORMATION', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sev.toUpperCase())
    );
  },

  isValidIncidentStatus(status: unknown): boolean {
    return (
      typeof status === 'string' &&
      ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'].includes(status.toUpperCase())
    );
  },

  sanitizePagination(queryPage: unknown, queryLimit: unknown, defaultLimit = 50, maxLimit = 200) {
    const page = Math.max(1, parseInt(String(queryPage), 10) || 1);
    const rawLimit = parseInt(String(queryLimit), 10) || defaultLimit;
    const limit = Math.max(1, Math.min(rawLimit, maxLimit));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  },

  sanitizeSearchQuery(query: unknown): string {
    if (typeof query !== 'string') return '';
    // Strip control characters, cap at 100 characters
    return query.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 100);
  },
};

/**
 * Centralized Error Boundary Handler
 * Protects against internal path and stack trace leakage.
 */
export function centralizedErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';

  logger.error(`[ErrorHandler] ${req.method} ${req.originalUrl} failed: ${err.message || String(err)}`, {
    status: statusCode,
    code: errorCode,
  });

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? 'An internal server error occurred. Please contact Mission Support.' : err.message,
    code: errorCode,
    timestamp: new Date().toISOString(),
  });
}
