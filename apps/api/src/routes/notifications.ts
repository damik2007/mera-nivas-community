import { Router } from "express";
import { and, desc, eq } from "@mycommunity/database";
import { db, schema, insertReturning, updateReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import { broadcastNotificationSchema } from "@mycommunity/validation";
import { asyncHandler, validateBody } from "../lib/http";
import { notifyUsers, notifySociety } from "../services/notify";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const notifications = await db.query.notifications.findMany({
      where: eq(schema.notifications.userId, req.user!.sub),
      orderBy: desc(schema.notifications.createdAt),
      limit: 50,
    });
    res.json({ notifications });
  })
);

router.get(
  "/preferences",
  asyncHandler(async (req, res) => {
    const prefs = await db.query.notificationPreferences.findMany({ where: eq(schema.notificationPreferences.userId, req.user!.sub) });
    res.json({ preferences: prefs });
  })
);

router.put(
  "/preferences",
  asyncHandler(async (req, res) => {
    const { category, channel, enabled } = req.body as { category: string; channel: any; enabled: boolean };
    const userId = req.user!.sub;
    const existing = await db.query.notificationPreferences.findFirst({
      where: and(
        eq(schema.notificationPreferences.userId, userId),
        eq(schema.notificationPreferences.category, category),
        eq(schema.notificationPreferences.channel, channel)
      ),
    });
    let pref;
    if (existing) {
      [pref] = await updateReturning(schema.notificationPreferences, { enabled }, eq(schema.notificationPreferences.id, existing.id));
    } else {
      [pref] = await insertReturning(schema.notificationPreferences, { userId, category, channel, enabled });
    }
    res.json({ preference: pref });
  })
);

router.post(
  "/broadcast",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(broadcastNotificationSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const { title, body, category, userIds } = req.body;
    if (userIds?.length) {
      await notifyUsers(societyId, userIds, { title, body, category });
    } else {
      await notifySociety(societyId, { title, body, category });
    }
    res.status(201).json({ ok: true });
  })
);

export default router;
