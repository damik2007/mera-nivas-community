import { Router } from "express";
import fs from "node:fs";
import { and, desc, eq, gt, isNull, or, like, inArray } from "@mycommunity/database";
import { db, schema, insertReturning, updateReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import { createNoticeSchema } from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { notifySociety, notifyUsers } from "../services/notify";
import { groupBy, indexBy } from "../lib/collections";
import { resolveTargetUserIds } from "../lib/targeting";
import { noticeAttachmentUpload, noticeAttachmentAbsolutePath, deleteNoticeAttachmentFile } from "../lib/uploads";

const router = Router();
router.use(requireAuth);

// Admins see every notice. Everyone else only sees notices addressed to
// them: broadcast to ALL, or narrowed to their own street/road, or they're
// explicitly on the recipient list.
function isAdminRole(role: string) {
  return role === "SOCIETY_ADMIN" || role === "SUPER_ADMIN";
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ notices: [] });
    const { category, q } = req.query as { category?: string; q?: string };

    const conditions = [
      eq(schema.notices.societyId, societyId),
      or(isNull(schema.notices.expiresAt), gt(schema.notices.expiresAt, new Date())),
    ];
    if (category) conditions.push(eq(schema.notices.category, category as any));
    if (q) conditions.push(like(schema.notices.title, `%${q}%`));

    let noticeRows = await db.query.notices.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.notices.isPinned), desc(schema.notices.createdAt)],
    });

    if (!isAdminRole(req.user!.role)) {
      const me = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.sub) });
      const myFlat = me?.flatId ? await db.query.flats.findFirst({ where: eq(schema.flats.id, me.flatId) }) : null;

      const selectedNoticeIds = new Set(
        (await db.query.noticeRecipients.findMany({ where: eq(schema.noticeRecipients.userId, req.user!.sub) })).map(
          (r) => r.noticeId
        )
      );

      noticeRows = noticeRows.filter((n) => {
        if (n.audienceType === "ALL" || !n.audienceType) return true;
        if (n.audienceType === "STREET") return myFlat?.blockId === n.audienceBlockId;
        if (n.audienceType === "ROAD") return myFlat?.roadNo != null && myFlat.roadNo === n.audienceRoadNo;
        if (n.audienceType === "SELECTED") return selectedNoticeIds.has(n.id);
        return false;
      });
    }

    const noticeIds = noticeRows.map((n) => n.id);
    const authorIds = [...new Set(noticeRows.map((n) => n.authorId))];

    const [authors, reads] = await Promise.all([
      authorIds.length
        ? db.query.users.findMany({ where: inArray(schema.users.id, authorIds), columns: { id: true, name: true } })
        : Promise.resolve([]),
      noticeIds.length
        ? db.query.noticeReadReceipts.findMany({ where: inArray(schema.noticeReadReceipts.noticeId, noticeIds) })
        : Promise.resolve([]),
    ]);
    const authorById = indexBy(authors, (a) => a.id);
    const readsByNotice = groupBy(reads, (r) => r.noticeId);

    res.json({
      notices: noticeRows.map((n) => ({
        ...n,
        hasAttachment: Boolean(n.attachmentUrl),
        attachmentUrl: undefined,
        author: { name: authorById.get(n.authorId)?.name ?? "" },
        readCount: readsByNotice.get(n.id)?.length ?? 0,
      })),
    });
  })
);

router.post(
  "/",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(createNoticeSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const body = req.body;
    const audienceType = body.audienceType ?? "ALL";

    const [notice] = await insertReturning(schema.notices, {
      societyId,
      authorId: req.user!.sub,
      title: body.title,
      body: body.body,
      category: body.category,
      isPinned: body.isPinned ?? false,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      audienceType,
      audienceBlockId: audienceType === "STREET" ? body.blockId : undefined,
      audienceRoadNo: audienceType === "ROAD" ? body.roadNo : undefined,
    });

    const targetUserIds = await resolveTargetUserIds(societyId, {
      audienceType,
      blockId: body.blockId,
      roadNo: body.roadNo,
      userIds: body.userIds,
    });

    if (audienceType === "SELECTED" && targetUserIds.length) {
      await db.insert(schema.noticeRecipients).values(targetUserIds.map((userId) => ({ noticeId: notice.id, userId })));
    }

    if (body.category === "urgent") {
      if (audienceType === "ALL") {
        await notifySociety(societyId, { title: `Urgent notice: ${notice.title}`, body: notice.body, category: "notice" });
      } else {
        await notifyUsers(societyId, targetUserIds, { title: `Urgent notice: ${notice.title}`, body: notice.body, category: "notice" });
      }
    }

    res.status(201).json({ notice });
  })
);

router.post(
  "/:id/attachment",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  noticeAttachmentUpload.single("file"),
  asyncHandler(async (req, res) => {
    const notice = await db.query.notices.findFirst({
      where: and(eq(schema.notices.id, req.params.id), eq(schema.notices.societyId, req.user!.societyId!)),
    });
    if (!notice) throw new HttpError(404, "Notice not found");
    if (!req.file) throw new HttpError(400, "No file uploaded");

    if (notice.attachmentUrl) deleteNoticeAttachmentFile(notice.attachmentUrl);
    const label = (req.body?.label as string | undefined)?.slice(0, 100) || req.file.originalname.slice(0, 100);
    await db
      .update(schema.notices)
      .set({ attachmentUrl: req.file.filename, attachmentLabel: label })
      .where(eq(schema.notices.id, notice.id));

    res.status(201).json({ ok: true, label });
  })
);

// Any signed-in resident who can see this notice can download its attachment
// — it's their notice too, not an admin-only file.
router.get(
  "/:id/attachment",
  asyncHandler(async (req, res) => {
    const notice = await db.query.notices.findFirst({
      where: and(eq(schema.notices.id, req.params.id), eq(schema.notices.societyId, req.user!.societyId!)),
    });
    if (!notice?.attachmentUrl) throw new HttpError(404, "No attachment on this notice");
    const filePath = noticeAttachmentAbsolutePath(notice.attachmentUrl);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "No attachment on this notice");
    res.download(filePath, notice.attachmentLabel || "attachment");
  })
);

router.post(
  "/:id/pin",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { pinned } = req.body as { pinned: boolean };
    const [notice] = await updateReturning(schema.notices, { isPinned: pinned }, eq(schema.notices.id, req.params.id));
    res.json({ notice });
  })
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const noticeId = req.params.id;
    const userId = req.user!.sub;
    const existing = await db.query.noticeReadReceipts.findFirst({
      where: and(eq(schema.noticeReadReceipts.noticeId, noticeId), eq(schema.noticeReadReceipts.userId, userId)),
    });
    if (!existing) {
      await db.insert(schema.noticeReadReceipts).values({ noticeId, userId });
    }
    res.json({ ok: true });
  })
);

router.get(
  "/:id/reads",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const readRows = await db.query.noticeReadReceipts.findMany({ where: eq(schema.noticeReadReceipts.noticeId, req.params.id) });
    const userIds = [...new Set(readRows.map((r) => r.userId))];
    const userRows = userIds.length ? await db.query.users.findMany({ where: inArray(schema.users.id, userIds) }) : [];
    const flatIds = [...new Set(userRows.map((u) => u.flatId).filter((id): id is string => !!id))];
    const flatRows = flatIds.length ? await db.query.flats.findMany({ where: inArray(schema.flats.id, flatIds) }) : [];
    const flatById = indexBy(flatRows, (f) => f.id);
    const userInfoById = new Map(
      userRows.map((u) => [u.id, { name: u.name, flat: u.flatId ? { number: flatById.get(u.flatId)?.number ?? "" } : null }])
    );

    const reads = readRows.map((r) => ({ ...r, user: userInfoById.get(r.userId) }));
    res.json({ reads });
  })
);

export default router;
