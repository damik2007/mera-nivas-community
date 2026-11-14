import { Router } from "express";
import { eq } from "@mycommunity/database";
import { db, schema } from "@mycommunity/database";
import {
  verifyPassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  requireAuth,
} from "@mycommunity/auth";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { rateLimit } from "../lib/rateLimit";
import { OAuth2Client } from "google-auth-library";
import { sendMail } from "../lib/mail";

const router = Router();

// 10 attempts per 15 minutes per IP. Generous enough for a mistyped password,
// tight enough to make guessing a password impractically slow.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: "login" });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: "refresh" });
const googleLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, name: "google" });
const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, name: "forgot-password" });

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Every sign-in attempt gets a row here — including a wrong password or a
// Google account with no matching user. Logging must never be able to break
// the actual login flow, so failures here are swallowed (and printed) rather
// than thrown.
async function logAuthEvent(input: {
  email: string;
  method: "PASSWORD" | "GOOGLE";
  success: boolean;
  reason?: string;
  userId?: string;
  ip?: string | null;
}) {
  try {
    await db.insert(schema.authEvents).values({
      email: input.email,
      method: input.method,
      success: input.success,
      reason: input.reason,
      userId: input.userId,
      ip: input.ip ?? undefined,
    });
  } catch (err) {
    console.error("Failed to record auth event", err);
  }
}

async function issueSession(user: {
  id: string;
  role: "SUPER_ADMIN" | "SOCIETY_ADMIN" | "RESIDENT" | "SECURITY";
  societyId: string | null;
  flatId: string | null;
  name: string;
  email: string;
}) {
  const payload = { sub: user.id, role: user.role, societyId: user.societyId, flatId: user.flatId };
  const accessToken = signAccessToken(payload);
  const { token: refreshToken, expiresAt } = signRefreshToken(payload);
  await db.insert(schema.refreshTokens).values({ token: refreshToken, userId: user.id, expiresAt });
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      societyId: user.societyId,
      flatId: user.flatId,
    },
  };
}

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) {
      await logAuthEvent({ email, method: "PASSWORD", success: false, reason: "no_account", ip: req.ip });
      throw new HttpError(401, "Invalid email or password");
    }

    if (!user.passwordHash) {
      await logAuthEvent({ email, method: "PASSWORD", success: false, reason: "google_only_account", userId: user.id, ip: req.ip });
      throw new HttpError(401, "This account signs in with Google only");
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await logAuthEvent({ email, method: "PASSWORD", success: false, reason: "wrong_password", userId: user.id, ip: req.ip });
      throw new HttpError(401, "Invalid email or password");
    }

    await logAuthEvent({ email, method: "PASSWORD", success: true, userId: user.id, ip: req.ip });
    res.json(await issueSession(user));
  })
);

router.post(
  "/google",
  googleLimiter,
  asyncHandler(async (req, res) => {
    if (!googleClient) {
      throw new HttpError(501, "Google sign-in is not configured on this server");
    }
    const { credential } = req.body as { credential?: string };
    if (!credential) throw new HttpError(400, "credential is required");

    let email: string | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const claims = ticket.getPayload();
      if (!claims?.email || !claims.email_verified) {
        // We do have an email at this point even though it's unverified —
        // still worth a record, since a signed-but-unverified email is
        // itself a meaningful (if rare) attempt.
        await logAuthEvent({
          email: claims?.email ?? "(unknown)",
          method: "GOOGLE",
          success: false,
          reason: "unverified_email",
          ip: req.ip,
        });
        throw new HttpError(401, "Google account has no verified email");
      }
      email = claims.email;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Signature/format failure on the token itself — we can't safely trust
      // anything inside it, including any email, so log without one.
      await logAuthEvent({ email: "(unverifiable token)", method: "GOOGLE", success: false, reason: "invalid_token", ip: req.ip });
      throw new HttpError(401, "Could not verify Google sign-in");
    }

    // This app is invite-only: an admin creates each resident/guard account first.
    // Google sign-in only unlocks an account that already exists with this email —
    // it never creates a new account on its own. A Google sign-in attempt for an
    // email with no matching account is still logged here, exactly as requested.
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) {
      await logAuthEvent({ email, method: "GOOGLE", success: false, reason: "no_account", ip: req.ip });
      throw new HttpError(403, "No account found for this Google email. Ask your society admin to add you first.");
    }

    await logAuthEvent({ email, method: "GOOGLE", success: true, userId: user.id, ip: req.ip });
    res.json(await issueSession(user));
  })
);

router.post(
  "/forgot-password",
  forgotLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });

    // Always the same response whether or not the email exists — otherwise
    // this endpoint becomes a way to discover which emails have accounts.
    if (user) {
      const token = signPasswordResetToken(user.id, user.passwordVersion);
      const base = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "";
      const link = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
      await sendMail(
        user.email,
        "Reset your Mera Nivas password",
        `Hi ${user.name},\n\nUse this link to reset your password (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
        `<p>Hi ${user.name},</p><p>Use this link to reset your password (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`
      );
    }

    res.json({ ok: true, message: "If that email has an account, a reset link has been sent." });
  })
);

router.post(
  "/reset-password",
  forgotLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const payload = verifyPasswordResetToken(token);
    if (!payload) throw new HttpError(400, "This reset link is invalid or has expired");

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.sub) });
    // pv must match the version the link was issued for — if the password
    // has already been changed since, this link is stale even if not expired.
    if (!user || user.passwordVersion !== payload.pv) {
      throw new HttpError(400, "This reset link is invalid or has expired");
    }

    const passwordHash = await hashPassword(password);
    await db
      .update(schema.users)
      .set({ passwordHash, passwordVersion: user.passwordVersion + 1 })
      .where(eq(schema.users.id, user.id));

    // Also sign the user out everywhere else, since the whole point of a
    // reset is that the old password (and any session from it) shouldn't
    // still work.
    await db.update(schema.refreshTokens).set({ revoked: true }).where(eq(schema.refreshTokens.userId, user.id));

    res.json({ ok: true });
  })
);

router.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw new HttpError(400, "refreshToken is required");

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }

    const stored = await db.query.refreshTokens.findFirst({ where: eq(schema.refreshTokens.token, refreshToken) });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token expired or revoked");
    }

    const accessToken = signAccessToken(payload);
    res.json({ accessToken });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await db.update(schema.refreshTokens).set({ revoked: true }).where(eq(schema.refreshTokens.token, refreshToken));
    }
    res.json({ ok: true });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.sub) });
    if (!user) throw new HttpError(404, "User not found");

    let flat: { id: string; number: string; block: { name: string } } | null = null;
    if (user.flatId) {
      const flatRow = await db.query.flats.findFirst({ where: eq(schema.flats.id, user.flatId) });
      if (flatRow) {
        const blockRow = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, flatRow.blockId) });
        flat = { id: flatRow.id, number: flatRow.number, block: { name: blockRow?.name ?? "" } };
      }
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      societyId: user.societyId,
      flatId: user.flatId,
      isOwner: user.isOwner,
      flat,
    });
  })
);

export default router;
