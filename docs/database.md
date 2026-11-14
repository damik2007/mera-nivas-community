# Database

Schema: `packages/database/src/schema.ts` (Drizzle ORM, MySQL dialect via the
`mysql2` driver). Works against both **MySQL 8+** and **MariaDB** (10.5+) —
this matters because most shared hosts, including Namecheap's cPanel plans,
actually run MariaDB under the "MySQL Databases" label.

## Why manual joins instead of Drizzle's relational `with` API

Drizzle's relational query builder (`db.query.x.findMany({ with: {...} })`)
generates correlated `JSON_ARRAYAGG(JSON_ARRAY(...))` subqueries. That SQL is
valid on MySQL 8 but **fails outright on MariaDB** with a syntax error. Since
this project targets shared hosts that typically run MariaDB, every route in
`apps/api/src/routes` fetches related rows with plain `db.select()`/
`db.query.x.findMany({ where })` calls and stitches them together in
JavaScript using the small helpers in `apps/api/src/lib/collections.ts`
(`groupBy`, `indexBy`). This is a little more code per route but works
identically on MySQL and MariaDB, at any version.

## No RETURNING clause

MySQL has no `RETURNING` clause, so inserts/updates that need the affected
row back use two small helpers exported from `packages/database/src/client.ts`:

- `insertReturning(table, values)` — generates the row's id (a cuid2 string)
  before inserting, then selects it back. Every `id` column in this schema is
  app-generated, not auto-increment, which is what makes this safe.
- `updateReturning(table, values, where)` — runs the update, then re-selects
  using the same `where` clause.

## Entity groups

- **Directory**: `societies` → `blocks` → `flats` → `users` (role: `SUPER_ADMIN` | `SOCIETY_ADMIN` | `RESIDENT` | `SECURITY`)
- **Events**: `events`, `eventInvitations`, `invitationImages`, `eventFundContributions`
- **Notice board**: `notices`, `noticeReadReceipts`
- **Billing**: `maintenanceCategories`, `bills`, `billLineItems`, `payments`
- **Guests & parking**: `guests`, `guestApprovals` (holds the signed QR token + status), `parkingSlots`, `parkingAllotments`
- **Notifications**: `notifications`, `notificationPreferences`
- **Audit**: `auditLogs` (reserved for future use — nothing writes to it yet)

## Commands

Run from the repo root (they proxy to `packages/database`):

```bash
npm run db:generate   # diff schema.ts against drizzle/, write a new SQL migration
npm run db:migrate    # apply pending migrations
npm run db:seed       # insert demo society/users/bills/parking data
```

Or `cd packages/database && npx drizzle-kit studio` for a visual browser of
the current data.

## Connecting to your own MySQL/MariaDB

Set `DATABASE_URL` in **both** `apps/api/.env` and `packages/database/.env`
to a standard MySQL connection string:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
```

On Namecheap/cPanel, that's typically:

```
DATABASE_URL="mysql://cpaneluser_dbuser:yourpassword@localhost:3306/cpaneluser_mycommunity"
```

See `docs/deployment-namecheap.md` for the full walkthrough, including
creating the database and user in cPanel and importing the schema via
phpMyAdmin if you'd rather not run the migration script on the server.

## Inspecting or editing data by hand (phpMyAdmin)

Since this schema uses plain MySQL types (no exotic features), phpMyAdmin
works fine for one-off inspection or edits:

- IDs are 24-character strings (cuid2), not auto-increment integers — don't
  regenerate them if you edit a row by hand, or foreign keys referencing
  that row will break.
- Enum columns (`role`, `status`, `category`, etc.) are real MySQL `ENUM`
  types — phpMyAdmin will show a dropdown of the valid values when editing.
- Timestamps are stored as `DATETIME` in UTC. The API always writes and
  reads them as UTC; if you edit one by hand, keep it in UTC too.
