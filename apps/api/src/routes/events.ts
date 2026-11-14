import { Router } from "express";
import { and, eq, inArray } from "@mycommunity/database";
import { db, schema, insertReturning, updateReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import {
  createEventSchema,
  inviteToEventSchema,
  rsvpSchema,
  generateInviteImageSchema,
  contributeToEventSchema,
} from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { generateInvitationCandidates } from "../services/inviteImage";
import { notifyUsers } from "../services/notify";
import { emitToSociety } from "../lib/realtime";
import { groupBy } from "../lib/collections";

const router = Router();
router.use(requireAuth);

function isAdminRole(role: string) {
  return role === "SOCIETY_ADMIN" || role === "SUPER_ADMIN";
}

// Admins can manage any event in their society. A resident can only manage
// (invite people to, see the RSVP summary of) an event they created
// themselves — never someone else's.
function assertCanManageEvent(event: { createdByUserId: string | null }, user: { role: string; sub: string }) {
  if (isAdminRole(user.role)) return;
  if (event.createdByUserId === user.sub) return;
  throw new HttpError(403, "You can only manage events you created");
}

// List events relevant to the caller: admins see all society events,
// residents see events they've been invited to, plus any event they created
// themselves (even before they've invited anyone to it yet).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { role, societyId, sub } = req.user!;
    if (!societyId) return res.json({ events: [] });

    if (isAdminRole(role)) {
      const events = await db.query.events.findMany({
        where: eq(schema.events.societyId, societyId),
        orderBy: schema.events.startsAt,
      });
      const eventIds = events.map((e) => e.id);
      const invitations = eventIds.length
        ? await db.query.eventInvitations.findMany({ where: inArray(schema.eventInvitations.eventId, eventIds) })
        : [];
      const images = eventIds.length
        ? await db.query.invitationImages.findMany({ where: inArray(schema.invitationImages.eventId, eventIds) })
        : [];
      const invitationsByEvent = groupBy(invitations, (i) => i.eventId);
      const imagesByEvent = groupBy(images, (i) => i.eventId);
      return res.json({
        events: events.map((e) => ({
          ...e,
          isMine: e.createdByUserId === sub,
          invitations: invitationsByEvent.get(e.id) ?? [],
          invitationImages: imagesByEvent.get(e.id) ?? [],
        })),
      });
    }

    const myInvites = await db.query.eventInvitations.findMany({
      where: eq(schema.eventInvitations.userId, sub),
      columns: { eventId: true },
    });
    const myOwnEvents = await db.query.events.findMany({
      where: and(eq(schema.events.societyId, societyId), eq(schema.events.createdByUserId, sub)),
      columns: { id: true },
    });
    const eventIds = Array.from(new Set([...myInvites.map((i) => i.eventId), ...myOwnEvents.map((e) => e.id)]));
    if (eventIds.length === 0) return res.json({ events: [] });

    const events = await db.query.events.findMany({
      where: and(eq(schema.events.societyId, societyId), inArray(schema.events.id, eventIds)),
      orderBy: schema.events.startsAt,
    });
    const myInvitations = await db.query.eventInvitations.findMany({
      where: and(inArray(schema.eventInvitations.eventId, eventIds), eq(schema.eventInvitations.userId, sub)),
    });
    const selectedImages = await db.query.invitationImages.findMany({
      where: and(inArray(schema.invitationImages.eventId, eventIds), eq(schema.invitationImages.selected, true)),
    });
    const invitationsByEvent = groupBy(myInvitations, (i) => i.eventId);
    const imagesByEvent = groupBy(selectedImages, (i) => i.eventId);
    res.json({
      events: events.map((e) => ({
        ...e,
        isMine: e.createdByUserId === sub,
        invitations: invitationsByEvent.get(e.id) ?? [],
        invitationImages: imagesByEvent.get(e.id) ?? [],
      })),
    });
  })
);

router.post(
  "/",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN", "RESIDENT"),
  validateBody(createEventSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) throw new HttpError(400, "Your account is not attached to a society");
    const body = req.body;
    const [event] = await insertReturning(schema.events, {
      societyId,
      title: body.title,
      description: body.description,
      category: body.category,
      venue: body.venue,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      isRecurring: body.isRecurring ?? false,
      recurrenceRule: body.recurrenceRule,
      createdByUserId: req.user!.sub,
    });
    res.status(201).json({ event });
  })
);

router.post(
  "/:id/invite",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN", "RESIDENT"),
  validateBody(inviteToEventSchema),
  asyncHandler(async (req, res) => {
    const { id: eventId } = req.params;
    const societyId = req.user!.societyId!;

    const event = await db.query.events.findFirst({ where: and(eq(schema.events.id, eventId), eq(schema.events.societyId, societyId)) });
    if (!event) throw new HttpError(404, "Event not found");
    assertCanManageEvent(event, req.user!);

    // Residents can only invite specific people they choose (which can of
    // course be "everyone I picked" — a select-all in the picker UI covers
    // that) — never the admin-only broadcast-to-whole-society or
    // broadcast-to-a-street modes.
    const { mode, userIds, blockIds } = isAdminRole(req.user!.role)
      ? req.body
      : { mode: "SELECTIVE" as const, userIds: req.body.userIds, blockIds: undefined };

    let targetUsers: { id: string }[] = [];

    if (mode === "SELECTIVE") {
      if (!userIds?.length) throw new HttpError(400, "userIds is required for selective invites");
      targetUsers = await db.query.users.findMany({
        where: and(inArray(schema.users.id, userIds), eq(schema.users.societyId, societyId)),
        columns: { id: true },
      });
    } else if (blockIds?.length) {
      const flatRows = await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds), columns: { id: true } });
      const flatIds = flatRows.map((f) => f.id);
      targetUsers = flatIds.length
        ? await db.query.users.findMany({
            where: and(eq(schema.users.societyId, societyId), eq(schema.users.role, "RESIDENT"), inArray(schema.users.flatId, flatIds)),
            columns: { id: true },
          })
        : [];
    } else {
      targetUsers = await db.query.users.findMany({
        where: and(eq(schema.users.societyId, societyId), eq(schema.users.role, "RESIDENT")),
        columns: { id: true },
      });
    }

    for (const u of targetUsers) {
      const existing = await db.query.eventInvitations.findFirst({
        where: and(eq(schema.eventInvitations.eventId, eventId), eq(schema.eventInvitations.userId, u.id)),
      });
      if (!existing) {
        await db.insert(schema.eventInvitations).values({ eventId, userId: u.id, mode });
      }
    }

    await notifyUsers(societyId, targetUsers.map((u) => u.id), {
      title: `You're invited: ${event.title}`,
      body: `RSVP for ${event.title} on ${event.startsAt.toDateString()}.`,
      category: "event",
    });

    emitToSociety(societyId, "event:invited", { eventId, count: targetUsers.length });
    res.json({ invited: targetUsers.length });
  })
);

router.post(
  "/:id/rsvp",
  requireRole("RESIDENT"),
  validateBody(rsvpSchema),
  asyncHandler(async (req, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.sub;
    const invitation = await db.query.eventInvitations.findFirst({
      where: and(eq(schema.eventInvitations.eventId, eventId), eq(schema.eventInvitations.userId, userId)),
    });
    if (!invitation) throw new HttpError(404, "You are not invited to this event");

    const [updated] = await updateReturning(
      schema.eventInvitations,
      { rsvpStatus: req.body.status, respondedAt: new Date() },
      and(eq(schema.eventInvitations.eventId, eventId), eq(schema.eventInvitations.userId, userId))!
    );
    res.json({ invitation: updated });
  })
);

router.get(
  "/:id/rsvp-summary",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN", "RESIDENT"),
  asyncHandler(async (req, res) => {
    const { id: eventId } = req.params;
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (!event) throw new HttpError(404, "Event not found");
    assertCanManageEvent(event, req.user!);

    const rows = await db.query.eventInvitations.findMany({
      where: eq(schema.eventInvitations.eventId, eventId),
      columns: { rsvpStatus: true },
    });
    const summary: Record<string, number> = {};
    for (const r of rows) summary[r.rsvpStatus] = (summary[r.rsvpStatus] || 0) + 1;
    res.json({ summary });
  })
);

router.post(
  "/:id/generate-invite-image",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(generateInviteImageSchema),
  asyncHandler(async (req, res) => {
    const { id: eventId } = req.params;
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (!event) throw new HttpError(404, "Event not found");

    const candidates = await generateInvitationCandidates({
      theme: req.body.theme,
      style: req.body.style,
      eventTitle: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
    });

    const created = [];
    for (const c of candidates) {
      const [row] = await insertReturning(schema.invitationImages, { eventId, ...c });
      created.push(row);
    }
    res.status(201).json({ candidates: created });
  })
);

router.post(
  "/:id/invite-images/:imageId/select",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { id: eventId, imageId } = req.params;
    await db.update(schema.invitationImages).set({ selected: false }).where(eq(schema.invitationImages.eventId, eventId));
    const [image] = await updateReturning(
      schema.invitationImages,
      { selected: true },
      eq(schema.invitationImages.id, imageId)
    );
    if (image) {
      await db.update(schema.events).set({ bannerUrl: image.imageUrl }).where(eq(schema.events.id, eventId));
    }
    res.json({ ok: true });
  })
);

router.post(
  "/:id/contribute",
  requireRole("RESIDENT"),
  validateBody(contributeToEventSchema),
  asyncHandler(async (req, res) => {
    const { id: eventId } = req.params;
    const [contribution] = await insertReturning(schema.eventFundContributions, {
      eventId,
      userId: req.user!.sub,
      amount: req.body.amount,
      note: req.body.note,
    });
    res.status(201).json({ contribution });
  })
);

export default router;
