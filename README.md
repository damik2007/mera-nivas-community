# MyCommunity

A full-stack residential society management platform: events with RSVP and
AI-assisted invitation art, a notice board, maintenance billing, guest
pre-approval with signed QR codes, a security gate scanner, and live guest
parking allotment.

The UI is mobile-first and scales up to a full desktop layout (sidebar
navigation on wide screens, bottom tab bar on phones) from the same codebase.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | Node.js + Express + TypeScript + Socket.io |
| Database | MySQL/MariaDB via Drizzle ORM (works on Namecheap/cPanel shared hosting — see `docs/deployment-namecheap.md`) |
| Auth | JWT access/refresh tokens + bcrypt, RBAC middleware |
| QR codes | HMAC-signed, time-limited, single-use tokens |
| Payments | Pluggable provider interface; ships with a working mock, stubs for Razorpay/Stripe |
| Notifications | Pluggable channel abstraction; ships with mocked push/SMS/email, real in-app delivery |

## Project structure

```
mycommunity/
├── apps/
│   ├── web/                  # React + Vite + TypeScript (residents, admins, security)
│   └── api/                  # Node.js + Express API + Socket.io
├── packages/
│   ├── database/             # Drizzle schema, migrations, seed data
│   ├── auth/                 # JWT + RBAC utilities
│   ├── validation/           # Zod schemas shared by every route
│   ├── notifications/        # Push/SMS/email abstraction (mocked)
│   ├── payments/             # Payment provider abstraction (mock + stubs)
│   ├── qr/                   # Signed QR token generation/verification
│   └── ui/                   # Shared React components + design tokens
├── infrastructure/
│   ├── docker/                # Dockerfiles + docker-compose.yml
│   ├── nginx/                 # Nginx config for serving the built web app
│   └── scripts/setup.sh       # One-command local setup
└── docs/
    ├── architecture.md
    ├── api.md
    ├── database.md
    └── security.md
```

There's no separate `apps/security-scanner` app — the guard's gate-scanner
screen lives at the `/` route of `apps/web` when signed in as a `SECURITY`
user (see `docs/architecture.md` for why).

## Quickstart

Requires **Node.js 20+** and a **MySQL 8+ or MariaDB 10.5+** server (local install, Docker, or your host's managed MySQL).

```bash
git clone <this repo>
cd mycommunity
# create the database first, e.g.: mysql -u root -e "CREATE DATABASE mycommunity;"
bash infrastructure/scripts/setup.sh   # installs deps, prompts you to set DATABASE_URL, migrates + seeds
npm run dev:api                        # terminal 1 — http://localhost:4000
npm run dev:web                        # terminal 2 — http://localhost:5173
```

Demo accounts (password for all: `Passw0rd!`):

| Role | Email |
|---|---|
| Super admin | `superadmin@mycommunity.test` |
| Society admin | `admin@mycommunity.test` |
| Resident (owner) | `resident@mycommunity.test` |
| Resident (tenant) | `resident2@mycommunity.test` |
| Security guard | `guard@mycommunity.test` |

### Docker

```bash
cd infrastructure/docker
docker compose up --build
# web:  http://localhost:8080
# api:  http://localhost:4000
```

Run migrations/seed once against the running container:

```bash
docker compose exec api npx tsx packages/database/src/migrate.ts
docker compose exec api npx tsx packages/database/src/seed.ts
```

## Environment variables

Each app has a `.env.example` — copy it to `.env` and adjust:

- `apps/api/.env.example` — JWT secrets, QR signing secret, payment/notification provider keys (all optional; the app runs fully functional with mocks if left blank)
- `packages/database/.env.example` — `DATABASE_URL` for the SQLite file
- `apps/web/.env.example` — `VITE_API_URL`

## Further reading

- [`docs/architecture.md`](docs/architecture.md) — system design and key decisions
- [`docs/api.md`](docs/api.md) — endpoint reference
- [`docs/database.md`](docs/database.md) — schema and MySQL/MariaDB notes
- [`docs/security.md`](docs/security.md) — auth, RBAC, and QR token design
- [`docs/deployment-namecheap.md`](docs/deployment-namecheap.md) — deploying to Namecheap/cPanel shared hosting with MySQL
