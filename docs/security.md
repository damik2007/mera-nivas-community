# Security

## Authentication

- Passwords are hashed with bcrypt (`packages/auth`, cost factor 10).
- Login returns a short-lived JWT access token (15 minutes) and a 30-day
  refresh token. The refresh token is stored server-side
  (`refreshTokens` table) so it can be revoked on logout — a stolen refresh
  token can be invalidated without waiting for expiry.
- `apps/web` stores both tokens in `localStorage` and transparently retries
  a request once with a refreshed access token on a 401
  (`apps/web/src/lib/api.ts`). This is the same trade-off most SPAs make;
  if you need XSS-hardened token storage, move the refresh token to an
  `httpOnly` cookie and adjust `lib/api.ts` accordingly.

## Authorization

Role-based access control via `requireAuth` + `requireRole(...)` middleware
(`packages/auth`). Every route file applies `router.use(requireAuth)` and
layers `requireRole` on top for admin/security-only actions. Data is also
scoped by `societyId`/`flatId` from the JWT payload, not from client input —
a resident can't pass someone else's `flatId` to read their bills.

## Guest QR tokens

`packages/qr` signs tokens as `base64url(payload).hmacSignature`:

- The payload carries the approval ID, guest ID, flat ID, an expiry
  timestamp, and a random nonce — nothing sequential or guessable.
- Verification checks the HMAC signature with a constant-time comparison
  (`crypto.timingSafeEqual`) before touching the database, so malformed or
  forged tokens are rejected cheaply.
- Expiry is enforced both in the token itself and against the stored
  `visitEnd` on the approval row, so revoking access early (or changing the
  visit window) takes effect even for an already-issued QR.
- Single-use tokens are marked `USED` on first successful scan and rejected
  on replay (`ALREADY_USED`).

Set `QR_SIGNING_SECRET` to a long random value in production — the default
in `.env.example` is for local development only.

## Known limitations to address before production

- **Rate limiting**: none yet on `/auth/login` or `/guests/verify-qr`. Add
  `express-rate-limit` or similar in front of both.
- **Token storage**: see the XSS note above.
- **Payments**: the mock provider always succeeds; real Razorpay/Stripe
  integrations need webhook signature verification, not just the
  client-initiated `charge()` call currently stubbed in
  `packages/payments`.
- **File uploads**: notice attachments and invitation images are currently
  URLs/data-URIs only — no upload endpoint exists, so wire one up (with
  size/type validation) if you need real file attachments.
- **Audit logging**: the `auditLogs` table exists but nothing writes to it
  yet — add calls where you need a compliance trail (e.g. guest approvals,
  payment records).
