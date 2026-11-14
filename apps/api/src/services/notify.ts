import { eq, inArray, and } from "@mycommunity/database";
import { db, schema } from "@mycommunity/database";
import { sendNotification, type NotificationChannel } from "@mycommunity/notifications";
import { emitToSociety } from "../lib/realtime";

interface NotifyArgs {
  title: string;
  body: string;
  category: "event" | "notice" | "bill" | "payment" | "guest" | "parking";
}

const DEFAULT_CHANNELS: NotificationChannel[] = ["in_app"];

/**
 * Fans a notification out to a set of users across their enabled channels,
 * persisting an in-app record for each and firing the mocked push/SMS/email
 * senders. Falls back to in-app only when a user has no explicit preference.
 */
export async function notifyUsers(societyId: string, userIds: string[], args: NotifyArgs) {
  if (userIds.length === 0) return;

  const users = await db.query.users.findMany({
    where: inArray(schema.users.id, userIds),
    columns: { id: true, email: true, phone: true },
  });

  const prefs = await db.query.notificationPreferences.findMany({
    where: and(inArray(schema.notificationPreferences.userId, userIds), eq(schema.notificationPreferences.category, args.category)),
  });

  const notifiedUserIds: string[] = [];
  for (const user of users) {
    const userPrefs = prefs.filter((p) => p.userId === user.id);
    const channels = userPrefs.length
      ? (userPrefs.filter((p) => p.enabled).map((p) => p.channel) as NotificationChannel[])
      : DEFAULT_CHANNELS;

    for (const channel of channels) {
      await db.insert(schema.notifications).values({
        societyId,
        userId: user.id,
        title: args.title,
        body: args.body,
        category: args.category,
        channel,
        status: "SENT",
      });
      if (channel !== "in_app") {
        await sendNotification({
          channel,
          to: { email: user.email, phone: user.phone },
          title: args.title,
          body: args.body,
        });
      }
    }
    notifiedUserIds.push(user.id);
  }

  emitToSociety(societyId, "notification:new", { title: args.title, category: args.category, userIds: notifiedUserIds });
}

/** Society-wide broadcast, e.g. urgent notices. */
export async function notifySociety(societyId: string, args: NotifyArgs) {
  const users = await db.query.users.findMany({ where: eq(schema.users.societyId, societyId), columns: { id: true } });
  await notifyUsers(societyId, users.map((u) => u.id), args);
}
