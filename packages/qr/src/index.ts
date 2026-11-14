import crypto from "crypto";
import QRCode from "qrcode";

const QR_SECRET = process.env.QR_SIGNING_SECRET || "dev-qr-secret-change-me";

export interface GuestQrPayload {
  approvalId: string;
  guestId: string;
  flatId: string;
  exp: number; // unix seconds
  nonce: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", QR_SECRET).update(data).digest("base64url");
}

/** Builds a compact, HMAC-signed, time-limited token: base64url(payload).signature */
export function createSignedQrToken(payload: Omit<GuestQrPayload, "nonce">): string {
  const full: GuestQrPayload = { ...payload, nonce: crypto.randomBytes(8).toString("hex") };
  const body = base64url(JSON.stringify(full));
  const signature = sign(body);
  return `${body}.${signature}`;
}

export type QrValidationResult =
  | { valid: true; payload: GuestQrPayload }
  | { valid: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

/** Validates signature + expiry only. Single-use / revocation checks happen against the DB. */
export function verifySignedQrToken(token: string): QrValidationResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "MALFORMED" };
  const [body, signature] = parts;
  const expected = sign(body);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }
  let payload: GuestQrPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
  if (Date.now() / 1000 > payload.exp) {
    return { valid: false, reason: "EXPIRED" };
  }
  return { valid: true, payload };
}

/** Renders the token as a PNG data URL for embedding in emails/UI. */
export async function renderQrImageDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 320 });
}
