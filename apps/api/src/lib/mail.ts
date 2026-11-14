import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

export const emailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!transporter) {
    // No SMTP set up yet — this is expected during initial setup, not an
    // error. Print it so whoever is watching the server log (you, during
    // testing) can still retrieve the link by hand.
    console.log(`[mail not configured] would send to ${to}: ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}
