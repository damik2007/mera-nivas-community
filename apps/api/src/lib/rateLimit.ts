import type { Request, Response, NextFunction } from "express";

/**
 * Minimal sliding-window rate limiter, keyed by IP + route.
 *
 * This process runs as a single Node instance under cPanel's Passenger, so an
 * in-memory map is enough — no Redis or extra dependency required. It exists
 * to slow down password-guessing against /auth/login and /auth/refresh; it is
 * not meant to replace a CDN/WAF for large-scale abuse.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically forget old buckets so this map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  const { windowMs, max, name } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }

    bucket.count += 1;
    next();
  };
}
