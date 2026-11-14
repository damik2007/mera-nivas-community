import { Router } from "express";
import { and, desc, eq, inArray } from "@mycommunity/database";
import { db, schema, insertReturning, updateReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import { preApproveGuestSchema, verifyQrSchema } from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { createSignedQrToken, verifySignedQrToken, renderQrImageDataUrl } from "@mycommunity/qr";
import { allotParkingSlot, releaseParkingSlotForApproval } from "../services/parking";
import { notifyUsers } from "../services/notify";
import { emitToSociety } from "../lib/realtime";
import { groupBy, indexBy } from "../lib/collections";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

// ---- Public guest pass link (no login) ----
// Anyone holding this link can already scan the same token at the gate, so this
// page reveals nothing more sensitive than the QR code itself — it exists so a
// resident can forward a link (WhatsApp, SMS) to a guest who has no account,
// and so either of them can re-open it later without hunting through the app.
const passLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, name: "guest-pass" });

router.get(
  "/pass/:token",
  passLimiter,
  asyncHandler(async (req, res) => {
    const result = verifySignedQrToken(req.params.token);
    if (!result.valid) throw new HttpError(404, "This pass link is invalid or has expired");

    const approval = await db.query.guestApprovals.findFirst({ where: eq(schema.guestApprovals.id, result.payload.approvalId) });
    // Defense in depth: the signature already guarantees the token wasn't
    // tampered with, but also confirm it still matches the approval on file.
    if (!approval || approval.qrToken !== req.params.token) throw new HttpError(404, "This pass link is invalid or has expired");

    const guest = await db.query.guests.findFirst({ where: eq(schema.guests.id, approval.guestId) });
    if (!guest) throw new HttpError(404, "This pass link is invalid or has expired");
    const flat = await db.query.flats.findFirst({ where: eq(schema.flats.id, guest.flatId) });
    const block = flat ? await db.query.blocks.findFirst({ where: eq(schema.blocks.id, flat.blockId) }) : null;

    const qrImage = await renderQrImageDataUrl(approval.qrToken);
    res.json({
      guestName: guest.name,
      hostFlat: block && flat ? `${block.name} · ${flat.number}` : null,
      visitStart: approval.visitStart,
      visitEnd: approval.visitEnd,
      status: approval.status,
      singleUse: approval.singleUse,
      qrImage,
    });
  })
);

router.use(requireAuth);

router.post(
  "/pre-approve",
  requireRole("RESIDENT"),
  validateBody(preApproveGuestSchema),
  asyncHandler(async (req, res) => {
    const flatId = req.user!.flatId;
    if (!flatId) throw new HttpError(400, "You are not linked to a flat");
    const body = req.body;

    const [guest] = await insertReturning(schema.guests, {
      flatId,
      name: body.name,
      phone: body.phone,
      vehicleNumber: body.vehicleNumber,
      purpose: body.purpose,
    });

    const visitEnd = new Date(body.visitEnd);
    const [approval] = await insertReturning(schema.guestApprovals, {
      guestId: guest.id,
      approvedById: req.user!.sub,
      qrToken: `pending-${guest.id}`,
      visitStart: new Date(body.visitStart),
      visitEnd,
      singleUse: body.singleUse ?? true,
    });

    const qrToken = createSignedQrToken({
      approvalId: approval.id,
      guestId: guest.id,
      flatId,
      exp: Math.floor(visitEnd.getTime() / 1000),
    });
    await db.update(schema.guestApprovals).set({ qrToken }).where(eq(schema.guestApprovals.id, approval.id));

    const qrImage = await renderQrImageDataUrl(qrToken);

    // In production, dispatch qrImage/qrToken to the guest via SMS/WhatsApp/email.
    res.status(201).json({ guest, approval: { ...approval, qrToken }, qrImage });
  })
);

router.get(
  "/mine",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const flatId = req.user!.flatId;
    if (!flatId) return res.json({ guests: [] });
    const guests = await db.query.guests.findMany({
      where: eq(schema.guests.flatId, flatId),
      orderBy: desc(schema.guests.createdAt),
    });
    const guestIds = guests.map((g) => g.id);

    const approvals = guestIds.length
      ? await db.query.guestApprovals.findMany({ where: inArray(schema.guestApprovals.guestId, guestIds) })
      : [];
    const approvalIds = approvals.map((a) => a.id);
    const allotments = approvalIds.length
      ? await db.query.parkingAllotments.findMany({ where: inArray(schema.parkingAllotments.guestApprovalId, approvalIds) })
      : [];
    const slotIds = allotments.map((a) => a.slotId);
    const slots = slotIds.length
      ? await db.query.parkingSlots.findMany({ where: inArray(schema.parkingSlots.id, slotIds) })
      : [];
    const slotById = indexBy(slots, (s) => s.id);
    const allotmentByApproval = indexBy(allotments, (a) => a.guestApprovalId);
    const approvalsByGuest = groupBy(
      approvals.map((a) => {
        const allotment = allotmentByApproval.get(a.id);
        return { ...a, allotment: allotment ? { ...allotment, slot: slotById.get(allotment.slotId)! } : null };
      }),
      (a) => a.guestId
    );

    res.json({ guests: guests.map((g) => ({ ...g, approvals: approvalsByGuest.get(g.id) ?? [] })) });
  })
);

// Re-view (and re-share) a QR you already generated — nothing here is
// regenerated or re-signed, it's the same token rendered again as an image.
router.get(
  "/:approvalId/qr",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const approval = await db.query.guestApprovals.findFirst({ where: eq(schema.guestApprovals.id, req.params.approvalId) });
    if (!approval) throw new HttpError(404, "Not found");
    const guest = await db.query.guests.findFirst({ where: eq(schema.guests.id, approval.guestId) });
    if (!guest || guest.flatId !== req.user!.flatId) throw new HttpError(404, "Not found");

    const qrImage = await renderQrImageDataUrl(approval.qrToken);
    res.json({ qrImage, qrToken: approval.qrToken });
  })
);

router.post(
  "/:approvalId/revoke",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const [approval] = await updateReturning(
      schema.guestApprovals,
      { status: "REVOKED", revokedAt: new Date() },
      eq(schema.guestApprovals.id, req.params.approvalId)
    );
    // If the guest was currently checked in and parked, revoking their pass
    // must not leave that slot occupied forever — free it immediately.
    await releaseParkingSlotForApproval(societyId, approval.id);
    res.json({ approval });
  })
);

// ---- Security scanner ----

router.post(
  "/verify-qr",
  requireRole("SECURITY"),
  validateBody(verifyQrSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const result = verifySignedQrToken(req.body.qrToken);

    if (!result.valid) {
      return res.json({ status: result.reason === "EXPIRED" ? "EXPIRED" : "INVALID" });
    }

    const approval = await db.query.guestApprovals.findFirst({ where: eq(schema.guestApprovals.id, result.payload.approvalId) });
    if (!approval) return res.json({ status: "INVALID" });

    const guest = await db.query.guests.findFirst({ where: eq(schema.guests.id, approval.guestId) });
    if (!guest) return res.json({ status: "INVALID" });
    const flat = await db.query.flats.findFirst({ where: eq(schema.flats.id, guest.flatId) });
    const block = flat ? await db.query.blocks.findFirst({ where: eq(schema.blocks.id, flat.blockId) }) : null;
    const guestWithFlat = { ...guest, flat: flat ? { ...flat, block } : null };

    const hostFlat = `${block?.name ?? ""} / ${flat?.number ?? ""}`;

    if (approval.status === "REVOKED") return res.json({ status: "REVOKED", approval });
    if (approval.status === "DENIED") return res.json({ status: "DENIED", approval });

    // ---- Outward scan: this guest is currently checked in — this scan is
    // them leaving, so check them out and free the parking slot for the next
    // guest. Same QR code as the inward scan; the system tells the two apart
    // by the guest's current status, not by anything the guard picks. ----
    if (approval.status === "CHECKED_IN") {
      const [updated] = await updateReturning(
        schema.guestApprovals,
        { status: "USED", checkedOutAt: new Date() },
        eq(schema.guestApprovals.id, approval.id)
      );
      await releaseParkingSlotForApproval(societyId, approval.id);

      await notifyUsers(societyId, [approval.approvedById], {
        title: `${guest.name} has checked out`,
        body: "Their parking slot has been released.",
        category: "guest",
      });
      emitToSociety(societyId, "guest:checked-out", { approvalId: approval.id, flat: flat?.number });

      return res.json({ status: "CHECKED_OUT", approval: updated, guest: guestWithFlat, hostFlat });
    }

    // A single-use pass that has already completed a full visit has nothing
    // left to do. A multi-use pass reaching USED just means "not currently
    // inside" — it's allowed to check in again below, for a return visit.
    if (approval.status === "USED" && approval.singleUse) {
      return res.json({ status: "ALREADY_USED", approval });
    }

    if (new Date() > approval.visitEnd) {
      await db.update(schema.guestApprovals).set({ status: "EXPIRED" }).where(eq(schema.guestApprovals.id, approval.id));
      return res.json({ status: "EXPIRED", approval });
    }

    // ---- Inward scan: first visit, or a returning multi-use guest. ----
    const [updated] = await updateReturning(
      schema.guestApprovals,
      { status: "CHECKED_IN", scannedById: req.user!.sub, checkedInAt: new Date(), checkedOutAt: null },
      eq(schema.guestApprovals.id, approval.id)
    );

    const allotted = await allotParkingSlot(societyId, approval.id);

    await notifyUsers(societyId, [approval.approvedById], {
      title: `${guest.name} has checked in`,
      body: allotted ? `Parking slot ${allotted.slot.code} assigned.` : "No guest parking slots available.",
      category: "guest",
    });

    emitToSociety(societyId, "guest:checked-in", { approvalId: approval.id, flat: flat?.number });

    res.json({
      status: "APPROVED",
      approval: updated,
      guest: guestWithFlat,
      hostFlat,
      parkingSlot: allotted?.slot ?? null,
    });
  })
);

// Manual override — a guard or admin can force a checkout without needing a
// second QR scan (guest left in a hurry, lost their phone, etc).
router.post(
  "/:approvalId/checkout",
  requireRole("SECURITY", "SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const [approval] = await updateReturning(
      schema.guestApprovals,
      { status: "USED", checkedOutAt: new Date() },
      eq(schema.guestApprovals.id, req.params.approvalId)
    );
    await releaseParkingSlotForApproval(societyId, approval.id);
    res.json({ approval });
  })
);

router.post(
  "/verify-qr/deny",
  requireRole("SECURITY"),
  asyncHandler(async (req, res) => {
    const { approvalId, reason } = req.body as { approvalId: string; reason: string };
    const [approval] = await updateReturning(
      schema.guestApprovals,
      { status: "DENIED", denyReason: reason, scannedById: req.user!.sub },
      eq(schema.guestApprovals.id, approvalId)
    );
    res.json({ approval });
  })
);

router.get(
  "/logs",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN", "SECURITY"),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const blockRows = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId), columns: { id: true } });
    const blockIds = blockRows.map((b) => b.id);
    const flatRows = blockIds.length
      ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds) })
      : [];
    const flatIds = flatRows.map((f) => f.id);
    const flatById = indexBy(flatRows, (f) => f.id);
    const guestRows = flatIds.length
      ? await db.query.guests.findMany({ where: inArray(schema.guests.flatId, flatIds) })
      : [];
    const guestIds = guestRows.map((g) => g.id);
    const guestById = indexBy(
      guestRows.map((g) => ({ ...g, flat: flatById.get(g.flatId)! })),
      (g) => g.id
    );

    const approvalRows = guestIds.length
      ? await db.query.guestApprovals.findMany({
          where: inArray(schema.guestApprovals.guestId, guestIds),
          orderBy: desc(schema.guestApprovals.createdAt),
          limit: 100,
        })
      : [];
    const approvalIds = approvalRows.map((a) => a.id);
    const allotments = approvalIds.length
      ? await db.query.parkingAllotments.findMany({ where: inArray(schema.parkingAllotments.guestApprovalId, approvalIds) })
      : [];
    const slotIds = allotments.map((a) => a.slotId);
    const slots = slotIds.length
      ? await db.query.parkingSlots.findMany({ where: inArray(schema.parkingSlots.id, slotIds) })
      : [];
    const slotById = indexBy(slots, (s) => s.id);
    const allotmentByApproval = indexBy(allotments, (a) => a.guestApprovalId);

    const approvals = approvalRows.map((a) => {
      const allotment = allotmentByApproval.get(a.id);
      return {
        ...a,
        guest: guestById.get(a.guestId)!,
        allotment: allotment ? { ...allotment, slot: slotById.get(allotment.slotId)! } : null,
      };
    });
    res.json({ approvals });
  })
);

export default router;
