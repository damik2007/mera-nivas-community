import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export type Role = "SUPER_ADMIN" | "SOCIETY_ADMIN" | "RESIDENT" | "SECURITY";

export interface AuthTokenPayload {
  sub: string; // user id
  role: Role;
  societyId?: string | null;
  flatId?: string | null;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
const RESET_SECRET = process.env.PASSWORD_RESET_SECRET || "dev-reset-secret-change-me";
const ACCESS_TTL = "15m";
const REFRESH_TTL_DAYS = 30;
const RESET_TTL = "1h";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload: AuthTokenPayload): { token: string; expiresAt: Date } {
  const token = jwt.sign(payload, REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_DAYS}d` });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as AuthTokenPayload;
}

/**
 * Password reset tokens use their own secret (never the access/refresh
 * ones) and a short lifetime, so a leaked reset link can't be reused as a
 * session token or stay valid indefinitely. `passwordVersion` is stamped in
 * at send-time and re-checked at reset-time so that any token issued before
 * the user's last password change is automatically dead, even if it hasn't
 * expired yet — without needing a separate revocation list.
 */
export function signPasswordResetToken(userId: string, passwordVersion: number): string {
  return jwt.sign({ sub: userId, pv: passwordVersion, purpose: "password-reset" }, RESET_SECRET, { expiresIn: RESET_TTL });
}

export function verifyPasswordResetToken(token: string): { sub: string; pv: number } | null {
  try {
    const payload = jwt.verify(token, RESET_SECRET) as { sub: string; pv: number; purpose: string };
    if (payload.purpose !== "password-reset") return null;
    return { sub: payload.sub, pv: payload.pv };
  } catch {
    return null;
  }
}

// ---- Express middleware ----

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const token = header.slice("Bearer ".length);
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Restricts a route to one or more roles. Must run after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
