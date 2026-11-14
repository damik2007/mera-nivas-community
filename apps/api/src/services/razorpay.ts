import crypto from "node:crypto";
import Razorpay from "razorpay";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Real payments only turn on once both keys are set in the Node app's
// environment variables — nothing else in the app needs to change for that
// to happen, matching what was asked for.
export const razorpayEnabled = Boolean(KEY_ID && KEY_SECRET);

const client = razorpayEnabled ? new Razorpay({ key_id: KEY_ID!, key_secret: KEY_SECRET! }) : null;

export function getRazorpayKeyId(): string | null {
  return razorpayEnabled ? KEY_ID! : null;
}

/** Amounts here are rupees; Razorpay's API wants paise (integer, ×100). */
export async function createRazorpayOrder(amountRupees: number, receipt: string) {
  if (!client) throw new Error("Razorpay is not configured");
  return client.orders.create({
    amount: Math.round(amountRupees * 100),
    currency: "INR",
    receipt,
  });
}

/**
 * The only trustworthy way to know a Razorpay payment actually succeeded:
 * recompute the signature server-side with the secret key and compare it to
 * what the browser sent back. Never mark a bill paid on the client's say-so
 * alone — this check is what stands between "the browser claims success" and
 * "Razorpay actually confirms it".
 */
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!KEY_SECRET) return false;
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  // Constant-time compare — a plain === here would leak timing information
  // about how many characters matched.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
