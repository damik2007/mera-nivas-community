// Prints the environment variables to paste into cPanel's "Setup Node.js App" screen,
// with freshly generated random secrets.   Run with:  npm run deploy:env
import { randomBytes } from "node:crypto";

const secret = () => randomBytes(48).toString("hex");

console.log(`
Paste these into cPanel > Setup Node.js App > your app > "Environment variables".
Replace the UPPERCASE parts. Do not add a PORT variable.

--- Required ---
CORS_ORIGIN=https://YOURDOMAIN.COM
DATABASE_URL=mysql://CPANELUSER_DBUSER:DBPASSWORD@localhost:3306/CPANELUSER_DBNAME
JWT_ACCESS_SECRET=${secret()}
JWT_REFRESH_SECRET=${secret()}
QR_SIGNING_SECRET=${secret()}
PASSWORD_RESET_SECRET=${secret()}
PAYMENT_PROVIDER=mock

--- Optional: Google sign-in ---
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com

--- Optional: outgoing email (forgot-password links) ---
FRONTEND_URL=https://YOURDOMAIN.COM/mycommunity
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=no-reply@yourdomain.com
SMTP_PASS=your-email-account-password
SMTP_FROM=no-reply@yourdomain.com

--- Optional: real online payments (Razorpay) ---
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

Tips:
- CORS_ORIGIN is your main site address only: https://, no trailing slash, no /mycommunity.
- If your database password contains symbols (@ : / # ? %), either use a password with only
  letters and numbers, or URL-encode it (@ becomes %40, # becomes %23, and so on).
- GOOGLE_CLIENT_ID must be the exact same value as VITE_GOOGLE_CLIENT_ID in
  apps/web/.env.production. Leave this variable out entirely to keep Google
  sign-in off — the app works fine without it, email/password login still works.
- Leave SMTP_HOST/SMTP_USER/SMTP_PASS out entirely to keep forgot-password
  emails off — the "forgot password" flow still runs, it just won't send an
  actual email; the reset link gets printed to the server log (stderr.log)
  instead, so you can still test it yourself in the meantime.
- Leave RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET out entirely to keep bill payments
  on the built-in mock/test flow. Add both (from your Razorpay dashboard) and
  restart the app to switch bill payments over to real Razorpay checkout —
  nothing else needs to change.
`);
