# Architecture

## Overview

MyCommunity is an npm-workspaces monorepo. The API and web app are
independent processes that only share code through the `packages/*`
workspace packages — there is no runtime coupling beyond HTTP and
Socket.io.

```
apps/web  ──HTTP/JSON──▶  apps/api  ──Drizzle──▶  SQLite (or Postgres)
apps/web  ◀─Socket.io───  apps/api
```

## Why Drizzle instead of Prisma

The original design used Prisma. In the environment this project was
generated in, Prisma's query-engine binary download was blocked by network
policy, so the persistence layer was rebuilt on **Drizzle ORM**. This isn't
a workaround you need to undo: Drizzle is a fully supported, actively
maintained choice with first-class TypeScript inference.

## MySQL/MariaDB, and why routes don't use Drizzle's relational `with` API

The database runs on MySQL (via the `mysql2` driver), specifically chosen so
this project works on shared hosts like Namecheap/cPanel that provide MySQL
through phpMyAdmin. One consequence: Drizzle's relational query builder
(`db.query.x.findMany({ with: {...} })`) generates `JSON_ARRAYAGG` subqueries
that are valid on MySQL 8 but **fail with a syntax error on MariaDB** — and
MariaDB is what most cPanel hosts actually run under the "MySQL" label. Every
route in `apps/api/src/routes` therefore fetches related rows with plain
`db.select()`/`findMany({ where })` calls and stitches them together in JS
using `groupBy`/`indexBy` helpers (`apps/api/src/lib/collections.ts`). It's a
little more code per route, but it's guaranteed to work on both MySQL and
MariaDB, at any version — see `docs/database.md` for details.

MySQL also has no `RETURNING` clause, so inserts/updates that need the
affected row back use `insertReturning`/`updateReturning` helpers exported
from `packages/database/src/client.ts` instead of `.returning()`.

## Why the security scanner is a route, not a separate app

The original plan called for `apps/security-scanner` as its own mobile-first
app. In practice, a guard's gate-scanning screen and a resident's app share
the same auth system, the same design system, and the same API — splitting
them into two deployable frontends would mean maintaining two build
pipelines for one extra route. Instead, `SECURITY`-role users land on a
dedicated, mobile-first scanner screen at `/` in `apps/web`
(`src/pages/GuardScanner.tsx`), and the app's responsive layout already
adapts it correctly for a phone at the gate. If you later want a truly
separate, installable PWA for guards, that screen is self-contained enough
to lift into its own Vite app with minimal changes.

## Request flow example: guest entry

1. Resident calls `POST /guests/pre-approve` with guest details and a visit
   window. The API creates a `Guest` + `GuestApproval` row and signs an
   HMAC token (`packages/qr`) encoding the approval ID and an expiry — the
   token itself carries no guessable sequential ID.
2. The resident shares the QR (rendered as a data URL, no external image
   host needed) with their guest.
3. At the gate, security scans (browser `BarcodeDetector` where available)
   or pastes the token into `POST /guests/verify-qr`. The API verifies the
   HMAC signature and expiry, checks the approval hasn't been used/revoked,
   marks it used, and calls `allotParkingSlot` (`apps/api/src/services/parking.ts`)
   to atomically claim the next free slot.
4. The resident gets an in-app notification with the assigned slot; the
   admin/security parking grid updates live via Socket.io
   (`parking:updated`).

## Real-time updates

`apps/api/src/lib/realtime.ts` wraps a single Socket.io server instance.
Clients join a room per society (`join-society`) and the API emits scoped
events (`parking:updated`, `guest:checked-in`, `notification:new`,
`event:invited`) so every connected admin/security screen reflects changes
without polling.

## AI invitation images

`apps/api/src/services/inviteImage.ts` defines the interface admins use to
generate invitation art: give it a theme + style, get back 2-4 candidate
image URLs to choose from. Out of the box it renders deterministic
template SVGs (data URLs, so nothing to host) — swap the `aiConfigured`
branch for a real image-generation API call once you have one, and every
caller (the events route, the UI) keeps working unchanged.

## Payments and notifications

Both are behind small interfaces (`packages/payments`, `packages/notifications`)
specifically so the app is fully runnable with zero external credentials.
Flip `PAYMENT_PROVIDER` to `razorpay`/`stripe` and implement the
corresponding provider once you have API keys; the billing routes don't
change.
