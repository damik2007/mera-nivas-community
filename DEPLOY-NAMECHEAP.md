# Deploy Mera Nivas to Namecheap (kushalreddy.me/mycommunity/)

These steps use `kushalreddy.me`. If your domain ever changes, swap it in every place it appears.

## What ends up where

| Piece | Where it lives | What it is |
|---|---|---|
| Website (React) | `https://kushalreddy.me/mycommunity/` | Static files in `public_html/mycommunity/` |
| API (Node.js) | `https://api.kushalreddy.me` | A Node.js app in `~/mycommunity-api/` (outside `public_html`) |
| Database | Namecheap MySQL | Tables already imported via phpMyAdmin |

Your portfolio at `kushalreddy.me` is not touched.

The API gets its own subdomain because it is the simplest setup that works on Namecheap:
Namecheap's Node.js feature works best on a domain or subdomain of its own.

---

## Part 1: On your computer (about 10 minutes)

Needs Node.js 20 or newer (you already have it if the app runs on your PC).

1. Extract this project and open a terminal in the `mycommunity` folder.
2. Open `apps/web/.env.production` and set your real API address:
   ```
   VITE_API_URL=https://api.kushalreddy.me
   ```
3. Install and build:
   ```bash
   npm install
   npm run build:deploy
   ```
   This creates a `deploy` folder with two subfolders: `frontend` and `api`.
4. Create your first login (the tables are empty, so nobody can log in yet):
   ```bash
   npm run db:admin-sql
   ```
   Answer the questions. It creates `admin-setup.sql` in the project folder.
5. Generate the settings for the server:
   ```bash
   npm run deploy:env
   ```
   Keep this output open. You'll paste it in Part 2, step 5.

---

## Part 2: In cPanel

### 1. Check the database and create the admin login
- **MySQL Databases**: make sure your database has a user attached with **ALL PRIVILEGES**. Note the full names: they start with your cPanel username, like `cpuser_mycommunity` and `cpuser_dbuser`.
- Tip: use a database password made of letters and numbers only. Symbols like `@ # / :` break the connection string.
- **phpMyAdmin**: select your database. You should see 22 tables. Open the **Import** tab, choose `admin-setup.sql`, click **Go**. Delete that file from your computer afterwards.

### 2. Create the API subdomain
cPanel > **Domains** > **Create A New Domain**, enter `api.kushalreddy.me`, and untick "Share document root" if it's shown. Leave the rest as default.

### 3. Upload the website
1. cPanel > **File Manager** > open `public_html`.
2. Create a folder named `mycommunity` and open it.
3. Turn on **Settings > Show Hidden Files (dotfiles)**.
4. Upload the **contents** of `deploy/frontend` (easiest: zip the contents on your PC, upload the zip, then right-click > Extract).
5. Check that `index.html`, `assets/` and `.htaccess` sit **directly** inside `public_html/mycommunity/`, not in a further subfolder.

### 4. Upload the API
1. In File Manager, go to your **home folder** (the level above `public_html`).
2. Create a folder named `mycommunity-api`.
3. Upload the two files from `deploy/api`: `app.js` and `package.json`.

### 5. Create the Node.js app
cPanel > **Setup Node.js App** > **Create Application**:

| Field | Value |
|---|---|
| Node.js version | 20.x (or 22.x) |
| Application mode | Production |
| Application root | `mycommunity-api` |
| Application URL | `api.kushalreddy.me` |
| Application startup file | `app.js` |

Click **Create**. Then, in the **Environment variables** section, add each line from the `npm run deploy:env` output — at minimum the ones under `--- Required ---` (`CORS_ORIGIN`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `QR_SIGNING_SECRET`, `PASSWORD_RESET_SECRET`, `PAYMENT_PROVIDER`). Do not add `PORT`. Click **Save**, then **Restart**. The optional sections (Google, email, Razorpay) are covered further down this guide — add them whenever you're ready, they're not needed to get the site running.

You do not need to click "Run NPM Install": `app.js` already contains everything it needs.

### 6. Test
1. Open `https://api.kushalreddy.me/health`. You should see `{"ok":true,"service":"mycommunity-api"}`.
2. Open `https://kushalreddy.me/mycommunity/`. You should see the login page.
3. Log in with the admin email and password from Part 1, step 4.

---

## Streets, houses, accounts, family & documents — one-time database update

This version adds an admin page (**Manage**, in the sidebar for admins) to create
streets, houses, resident/staff accounts, family members, and an optional legal
document per account. It needs three small additions to your existing database —
run this **once**, before deploying this version:

1. In cPanel, open **phpMyAdmin** and select your database.
2. Open the **SQL** tab.
3. Open `packages/database/sql/002-streets-houses-family-documents.sql` from the
   zip (any text editor, or File Manager's **Edit**), copy its contents, paste
   into the SQL tab, and click **Go**.
4. Do the same with `packages/database/sql/003-event-creator.sql` — this one
   lets residents post their own events (not just admins).
5. Do the same with `packages/database/sql/004-guest-checkin-checkout.sql` —
   this one lets the same guest QR be scanned once to check in (allots
   parking) and again to check out (frees it).
6. Do the same with `packages/database/sql/005-billing-notices-auth-log.sql`
   — adds sign-in logging, one-off charges (fines/damage), and targeted
   notices (by street, road, or hand-picked residents) with attachments.

## Forgot password (optional — needs an email account)

Password resets work without any setup — they just won't actually email
anyone yet. The reset link gets printed to `mycommunity-api/stderr.log`
instead, so you can copy it out yourself while testing.

To send real emails:
1. In cPanel, go to **Email Accounts** and create one, e.g.
   `no-reply@kushalreddy.me`, with a real password.
2. Click **Connect Devices** next to it to see the mail server settings —
   note the **outgoing (SMTP)** hostname and port (usually `mail.kushalreddy.me`,
   port `587`).
3. In **Setup Node.js App**, add:
   ```
   FRONTEND_URL=https://kushalreddy.me/mycommunity
   SMTP_HOST=mail.kushalreddy.me
   SMTP_PORT=587
   SMTP_USER=no-reply@kushalreddy.me
   SMTP_PASS=that email account's password
   SMTP_FROM=no-reply@kushalreddy.me
   ```
4. **Restart** the app. Test with "Forgot password?" on the login page.

## Real online payments with Razorpay (optional)

Without this, bill payments use a built-in mock/test flow — good enough for
a demo, but nothing real is charged.

1. Sign up at [razorpay.com](https://razorpay.com) and complete their
   verification (needed before you can accept real payments).
2. In the Razorpay dashboard, go to **Settings → API Keys** and generate a
   **Key ID** and **Key Secret**.
3. In **Setup Node.js App**, add:
   ```
   RAZORPAY_KEY_ID=your key id
   RAZORPAY_KEY_SECRET=your key secret
   ```
4. **Restart** the app. That's the whole switch — residents now see Razorpay's
   real checkout instead of the mock "Pay" button, with no other changes
   needed. Use Razorpay's test-mode keys first if you want to try it without
   real money moving.

It only adds two new columns and one new table — nothing existing is changed or
removed, and it's safe even if you're not sure whether you've run it before
(each part only adds something that doesn't already exist).

Uploaded documents are stored in `mycommunity-api/uploads/` on the server (never
inside `public_html`, so they're never reachable by a direct URL — only through
the app's own login-protected download button). Redeploying the API only
replaces `app.js` and `package.json`, so this folder is never touched or lost.

## Google sign-in (optional)

The app can offer "Sign in with Google" on the login page, for accounts that already
exist (an admin still has to create the account first — Google sign-in unlocks an
existing account, it doesn't create new ones).

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), open
   your OAuth 2.0 Client ID (or create one: **Create Credentials → OAuth client ID →
   Web application**).
2. Under **Authorized JavaScript origins**, add `https://kushalreddy.me` — the bare
   domain, no path, no trailing slash. (You do **not** need a redirect URI for this;
   the button uses Google's popup flow.)
3. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
4. Put it in **two** places:
   - `apps/web/.env.production`, as `VITE_GOOGLE_CLIENT_ID=...` (already set if you're
     using the zip I gave you)
   - The `GOOGLE_CLIENT_ID` environment variable in **Setup Node.js App** — same value,
     no `VITE_` prefix
5. Rebuild (`npm run build:deploy`) and redeploy as usual, then **Restart** the app.

Don't want Google sign-in? Just leave `GOOGLE_CLIENT_ID` out of the Node app's
environment variables — the button won't appear, and email/password login is
unaffected either way.

## If build-tmp or the extracted source is a mess

If you've extracted the zip more than once, or things ended up nested
(`mycommunity/mycommunity/...`), don't try to patch it — start clean:

```bash
cd ~
rm -rf mycommunity build-tmp
# re-upload mycommunity-deploy-ready.zip to your home folder in File Manager, then:
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
hash -r
unzip -o mycommunity-deploy-ready.zip
cd mycommunity
ls scripts/          # must list build-deploy.mjs and print-env.mjs — confirms it's the right copy
npm install --no-audit --no-fund
npm run build:deploy
```

If `npm install` fails with an ENOENT about `nodevenv/.../lib/package.json`, that
means you're inside cPanel's `source .../activate` shell, which sometimes points
npm at the wrong folder. The `export PATH=...` / `hash -r` lines above route
around it by using the server's Node install directly.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Blank page, red 404s for `.js` / `.css` in the browser console | Files are nested one folder too deep in `public_html/mycommunity/`. `index.html` must be directly inside it. |
| Page works, but refreshing on `/mycommunity/events` gives 404 | The hidden `.htaccess` did not upload. Enable "Show Hidden Files" and upload it again. |
| Login says "Failed to fetch" / CORS error in the console | `CORS_ORIGIN` must be exactly `https://kushalreddy.me` (no trailing slash, no `/mycommunity`). Fix it in Setup Node.js App, then Restart. If the browser is calling the wrong API address, fix `apps/web/.env.production` and re-run `npm run build:deploy`. |
| `api.kushalreddy.me/health` shows an error or "Incomplete response" | Open the app's log (the `stderr.log` file in `mycommunity-api`, or the log link in Setup Node.js App). A "Missing required environment variables" message means a variable was skipped. |
| Log says "Access denied for user" | The DB user is not attached to the database with ALL PRIVILEGES, or the name or password in `DATABASE_URL` is wrong. Names include the `cpuser_` prefix. |
| Log says `ECONNREFUSED` | In `DATABASE_URL`, replace `localhost` with `127.0.0.1`, then Restart. |
| "Invalid email or password" | `admin-setup.sql` was not imported, or the email is typed differently. |
| Browser warns the subdomain is not secure | AutoSSL for the new subdomain can take a while. In cPanel > **SSL/TLS Status**, click **Run AutoSSL**. |

After changing any environment variable in cPanel, always click **Restart**.

## Updating the app later
1. Change the code, then run `npm run build:deploy` again.
2. Upload the new contents of `deploy/frontend` over `public_html/mycommunity/`.
3. Upload the new `app.js` over `mycommunity-api/app.js`, then click **Restart** in Setup Node.js App.

## Notes
- Do not run `npm run db:seed` on the live database: it creates demo accounts with a public password.
- Live updates (parking, notifications) use Socket.io. If Namecheap blocks WebSockets, they fall back to polling, so they may arrive a few seconds late. Nothing breaks.
- `PAYMENT_PROVIDER=mock` means payments are simulated. That's fine for a showcase.
