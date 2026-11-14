> **Short on time?** For the simplest step-by-step path (frontend at `yourdomain.com/mycommunity/`, API on a subdomain, no `npm install` on the server), follow [`DEPLOY-NAMECHEAP.md`](../DEPLOY-NAMECHEAP.md) in the repo root instead. This document is the longer background reference.

# Deploying to Namecheap Shared Hosting (Stellar / cPanel) with MySQL

Read this section before you start — it will save you time.

## The honest constraint: shared hosting and Node.js

Namecheap's Stellar-tier shared hosting is a cPanel account built primarily
for static sites and PHP + MySQL apps. Whether it can run this project's
**Node.js/Express API** depends entirely on one thing: does your cPanel have
a **"Setup Node.js App"** icon (under the "Software" section)? That feature
is Namecheap's Node support, built on Passenger, and it's only present on
some plans/tiers — it changes over time, so check your own cPanel rather
than trust a plan name. Two other limits apply even when it's present:

- **No persistent background processes beyond what Passenger manages** — this
  is fine for a normal Express app (Passenger starts/stops it for you), but
- **WebSocket support is inconsistent.** Socket.io will still work because it
  automatically falls back to HTTP long-polling, but you may not get instant
  live updates (`parking:updated`, `notification:new`, etc.) — they'll arrive
  on the next poll instead. Nothing breaks; it's just less snappy.

Given that, you have two realistic paths:

- **Path A — everything on Namecheap.** Use this if your cPanel has "Setup
  Node.js App". Simplest to manage, one bill, good enough for most societies.
- **Path B — hybrid.** Host the frontend (static files) on Namecheap — that's
  exactly what shared hosting is great at — and run the API on a host built
  for persistent Node processes (a small VPS, Render, Railway, Fly.io, etc.),
  pointed at the same MySQL database via Namecheap's **Remote MySQL** feature.
  Use this if "Setup Node.js App" isn't available on your plan, or if you
  want reliable real-time updates.

MySQL itself is well-supported on every Namecheap shared plan via cPanel's
**MySQL Databases** tool and **phpMyAdmin** — that part is identical in both
paths.

---

## Step 1 — Create the MySQL database in cPanel

1. cPanel → **MySQL Databases**.
2. Under "Create New Database", enter a name (e.g. `mycommunity`) and create
   it. cPanel will prefix it with your account username, e.g.
   `cpaneluser_mycommunity` — that full prefixed name is what you'll use.
3. Under "MySQL Users", create a user with a strong password. Note it down.
4. Under "Add User to Database", add that user to the database you just
   created, and grant **ALL PRIVILEGES**.
5. Your connection string is now:
   ```
   mysql://cpaneluser_dbuser:yourpassword@localhost:3306/cpaneluser_mycommunity
   ```
   (host is `localhost` because the API, when hosted on the same account,
   connects to MySQL locally — see Path B below if the API lives elsewhere.)

## Step 2 — Create the schema via phpMyAdmin (no server access needed)

This works regardless of which path you take, and needs no Node.js on the
server at all:

1. On your own machine, run `npm run db:generate` if you haven't already —
   this produces a SQL file at `packages/database/drizzle/0000_*.sql`.
2. In cPanel, open **phpMyAdmin**, select the database you created, and go
   to the **Import** tab.
3. Choose the `.sql` file from `packages/database/drizzle/` and click **Go**.
   This creates all 22 tables.

If you *do* have SSH or a Terminal app in cPanel, it's simpler to just run
`npm run db:migrate` from the project directory instead of steps 2 to 3.

### Creating your first login without SSH

`npm run db:create-admin` is a Node script, so it needs to run somewhere
with Node — either your own machine connected to the production database,
or the server itself if you have SSH/Terminal access.

**From your own machine** (if your plan allows remote MySQL connections —
see cPanel's **Remote MySQL** tool to whitelist your home/office IP):
```bash
cd packages/database
echo 'DATABASE_URL="mysql://cpaneluser_dbuser:yourpassword@YOUR_SERVER_IP:3306/cpaneluser_mycommunity"' > .env
npm run create-admin   # interactive prompts for one real admin account
```

**On the server**, if cPanel gives you a Terminal (Software -> Terminal) or
SSH access:
```bash
cd ~/mycommunity   # wherever you uploaded the project
npm run db:create-admin --workspace=@mycommunity/database
```

Avoid `npm run db:seed` in production — it inserts demo/test accounts with a
public example password. Use `db:create-admin` instead; it interactively
creates one real society and one real admin login.

---

## Path A — Node.js app + static frontend, all on Namecheap

### A1. Upload the project

Zip the project (excluding `node_modules`) and upload it via cPanel's **File
Manager** (or FTP), then extract it outside `public_html` — e.g. at
`~/mycommunity` — since `public_html` should hold only the built frontend.

### A2. Set up the Node.js app (the API)

1. cPanel → **Setup Node.js App** → **Create Application**.
2. Node.js version: 20.x (or the newest available).
3. Application root: point it at the repo root (`mycommunity`), since this
   is a monorepo and the API depends on the `packages/*` workspaces next to
   it — not just the `apps/api` folder.
4. Application URL: a subdomain like `api.yourdomain.com` (create the
   subdomain first under **Domains** if it doesn't exist).
5. Add environment variables in the Node app's "Environment variables"
   section — do **not** rely on a `.env` file here, cPanel's Node interface
   sets these directly:
   ```
   CORS_ORIGIN=https://yourdomain.com
   DATABASE_URL=mysql://cpaneluser_dbuser:yourpassword@localhost:3306/cpaneluser_mycommunity
   JWT_ACCESS_SECRET=<generate a long random string>
   JWT_REFRESH_SECRET=<a different long random string>
   QR_SIGNING_SECRET=<another long random string>
   PAYMENT_PROVIDER=mock
   ```
   Leave `PORT` unset — cPanel assigns and injects it itself for Node apps.
6. Click **Run NPM Install** in the Node app UI — this installs all
   workspace dependencies.
7. cPanel's Node feature expects a plain `.js` entry point. Since this API
   is TypeScript run via `tsx`, create a tiny wrapper at
   `apps/api/server.cjs`:
   ```js
   require("tsx/cjs");
   require("./src/index.ts");
   ```
   and set cPanel's "Application startup file" to `apps/api/server.cjs`.
8. Click **Restart**. Check the app's logs (same cPanel screen) if it
   doesn't come up — the most common issue is a wrong `DATABASE_URL`.

### A3. Build and upload the frontend

On your own machine (not the server):
```bash
cd apps/web
echo "VITE_API_URL=https://api.yourdomain.com" > .env
npm install
npm run build
```
This produces `apps/web/dist/`. Upload the **contents** of `dist/` (not the
folder itself) to `public_html` (or `public_html/yourapp` for a subfolder)
via File Manager or FTP.

### A4. Fix client-side routing

React Router needs every path to serve `index.html`. Create
`public_html/.htaccess`:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### A5. Verify

Visit `https://yourdomain.com` — you should see the login page. Log in with
the admin account you created in Step 2. If the frontend can't reach the
API, check `https://api.yourdomain.com/health` returns `{"ok":true,...}`.

---

## Path B — frontend on Namecheap, API hosted elsewhere

Use this if "Setup Node.js App" isn't available, or you want reliable
real-time updates.

1. **Frontend**: same as A3 to A4 above, but point `VITE_API_URL` at
   wherever you host the API (e.g. `https://mycommunity-api.onrender.com`).
2. **API**: deploy `apps/api` (plus the `packages/*` it depends on) to a
   Node host of your choice — a small VPS, Render, Railway, or Fly.io all
   work with the existing `npm run dev:api` / `npx tsx src/index.ts` command,
   or the `infrastructure/docker/Dockerfile.api` if the host supports Docker.
3. **Database**: keep using the Namecheap MySQL database from Step 1. In
   cPanel, go to **Remote MySQL** and add the API host's outbound IP address
   to the access list. If your Node host uses dynamic IPs (no fixed
   outbound address), create the database directly on that platform instead
   and skip Namecheap's MySQL for this purpose.
4. Set `CORS_ORIGIN` on the API to your Namecheap domain
   (`https://yourdomain.com`) so the browser is allowed to call it.

---

## After deployment

- Change `PAYMENT_PROVIDER` and wire real Razorpay/Stripe credentials when
  you're ready to take real payments — see `docs/security.md` for what that
  needs beyond the current mock.
- Rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `QR_SIGNING_SECRET`
  to long random values you generate yourself — never reuse the values from
  `.env.example`.
- Take regular backups of the MySQL database via phpMyAdmin's **Export** tab
  or cPanel's **Backup Wizard**.
