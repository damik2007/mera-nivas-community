export type NotificationChannel = "in_app" | "push" | "sms" | "email";

export interface SendNotificationInput {
  channel: NotificationChannel;
  to: { email?: string | null; phone?: string | null; deviceToken?: string | null };
  title: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  detail: string;
}

/**
 * In-app notifications are persisted directly by the API (see routes/notifications.ts)
 * so no external call is needed here. Push/SMS/email are mocked with console logging;
 * swap the bodies below for Firebase Admin SDK, Twilio, and SendGrid respectively.
 */
export async function sendNotification(input: SendNotificationInput): Promise<SendResult> {
  switch (input.channel) {
    case "push":
      console.log(`[push:FCM mock] -> ${input.to.deviceToken ?? "unknown-device"}: ${input.title}`);
      return { ok: true, detail: "queued via mock FCM" };
    case "sms":
      console.log(`[sms:Twilio mock] -> ${input.to.phone ?? "unknown-phone"}: ${input.title} — ${input.body}`);
      return { ok: true, detail: "queued via mock Twilio" };
    case "email":
      console.log(`[email:SendGrid mock] -> ${input.to.email ?? "unknown-email"}: ${input.title}`);
      return { ok: true, detail: "queued via mock SendGrid" };
    case "in_app":
    default:
      return { ok: true, detail: "handled in-app" };
  }
}
