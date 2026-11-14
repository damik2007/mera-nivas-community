# API reference

Base URL: `http://localhost:4000` (see `apps/api/.env.example`).

All endpoints except `/health`, `/auth/login`, and `/auth/refresh` require
`Authorization: Bearer <accessToken>`. Roles: `SUPER_ADMIN`, `SOCIETY_ADMIN`,
`RESIDENT`, `SECURITY`.

## Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` → `{ accessToken }` |
| POST | `/auth/logout` | any | Revokes a refresh token |
| GET | `/auth/me` | any | Current user profile |

## Directory

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/directory?q=` | any | Block → flat → resident tree, optional search |

## Events

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/events` | any | Admin: all events. Resident: events they're invited to |
| POST | `/events` | admin | Create an event |
| POST | `/events/:id/invite` | admin | `{ mode: "SELECTIVE"\|"BROADCAST", userIds?, blockIds? }` |
| POST | `/events/:id/rsvp` | resident | `{ status: "YES"\|"NO"\|"MAYBE" }` |
| GET | `/events/:id/rsvp-summary` | admin | Counts by RSVP status |
| POST | `/events/:id/generate-invite-image` | admin | `{ theme, style }` → candidate images |
| POST | `/events/:id/invite-images/:imageId/select` | admin | Sets the event banner |
| POST | `/events/:id/contribute` | resident | Event fund contribution |

## Notices

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/notices?category=&q=` | any | Active notices, pinned first |
| POST | `/notices` | admin | `category: "urgent"` triggers a society-wide notification |
| POST | `/notices/:id/pin` | admin | `{ pinned }` |
| POST | `/notices/:id/read` | any | Marks read for the current user |
| GET | `/notices/:id/reads` | admin | Read receipts |

## Billing

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/bills/categories` | any | Maintenance categories |
| POST | `/bills/categories` | admin | `{ name, billingMethod, rate }` — see below |
| POST | `/bills/generate` | admin | `{ cycleLabel, dueInDays }` — generates one bill per flat |
| GET | `/bills/mine` | resident | Bills for the caller's flat |
| GET | `/bills/flat/:flatId` | any | Bills for a specific flat |
| POST | `/bills/:billId/pay` | resident | `{ amount, provider }` |
| GET | `/bills/payments/:paymentId/receipt` | any | Plain-text receipt |
| GET | `/bills/dashboard` | admin | Collections summary + spend by category |

`billingMethod` is one of `FLAT_RATE` (same amount per flat), `PER_SQFT`
(rate × flat area), or `EQUAL_SPLIT` (rate ÷ number of flats).

## Guests & security

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/guests/pre-approve` | resident | Creates a guest + signed QR (`qrImage` is a data URL) |
| GET | `/guests/mine` | resident | Guest history for the caller's flat |
| POST | `/guests/:approvalId/revoke` | resident | Revokes a pending approval |
| POST | `/guests/verify-qr` | security | `{ qrToken }` → status + guest + assigned parking slot |
| POST | `/guests/:approvalId/checkout` | security | Marks checkout, releases parking |
| POST | `/guests/verify-qr/deny` | security | `{ approvalId, reason }` |
| GET | `/guests/logs` | admin/security | Recent approvals across the society |

## Parking

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/parking/slots` | any | All slots with active allotments |
| POST | `/parking/slots` | admin | `{ code, zone?, type? }` |
| POST | `/parking/slots/:id/block` | admin/security | `{ blocked }` |
| GET | `/parking/occupancy` | any | Free/occupied/blocked counts |

## Notifications

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/notifications` | any | Last 50 for the caller |
| GET | `/notifications/preferences` | any | Per-category channel preferences |
| PUT | `/notifications/preferences` | any | `{ category, channel, enabled }` |
| POST | `/notifications/broadcast` | admin | `{ title, body, category, channel, userIds? }` — omit `userIds` for society-wide |

## Socket.io events

Connect to the API's base URL, then `socket.emit("join-society", societyId)`.
The server emits: `event:invited`, `notification:new`, `guest:checked-in`,
`parking:updated`.
