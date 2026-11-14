import { Router } from "express";
import { eq } from "@mycommunity/database";
import { db, schema, insertReturning, updateReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import { createParkingSlotSchema } from "@mycommunity/validation";
import { asyncHandler, validateBody } from "../lib/http";
import { emitToSociety } from "../lib/realtime";
import { groupBy, indexBy } from "../lib/collections";
import { inArray, isNull, and } from "@mycommunity/database";

const router = Router();
router.use(requireAuth);

router.get(
  "/slots",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ slots: [] });
    const slots = await db.query.parkingSlots.findMany({
      where: eq(schema.parkingSlots.societyId, societyId),
      orderBy: (s, { asc }) => [asc(s.zone), asc(s.code)],
    });
    const slotIds = slots.map((s) => s.id);

    const allotments = slotIds.length
      ? await db.query.parkingAllotments.findMany({
          where: and(inArray(schema.parkingAllotments.slotId, slotIds), isNull(schema.parkingAllotments.releasedAt)),
        })
      : [];
    const approvalIds = allotments.map((a) => a.guestApprovalId);
    const approvals = approvalIds.length
      ? await db.query.guestApprovals.findMany({ where: inArray(schema.guestApprovals.id, approvalIds) })
      : [];
    const guestIds = approvals.map((a) => a.guestId);
    const guests = guestIds.length ? await db.query.guests.findMany({ where: inArray(schema.guests.id, guestIds) }) : [];
    const guestById = indexBy(guests, (g) => g.id);
    const approvalById = indexBy(
      approvals.map((a) => ({ ...a, guest: guestById.get(a.guestId) })),
      (a) => a.id
    );
    const allotmentsBySlot = groupBy(
      allotments.map((a) => ({ ...a, guestApproval: approvalById.get(a.guestApprovalId) })),
      (a) => a.slotId
    );

    res.json({ slots: slots.map((s) => ({ ...s, allotments: allotmentsBySlot.get(s.id) ?? [] })) });
  })
);

router.post(
  "/slots",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(createParkingSlotSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const [slot] = await insertReturning(schema.parkingSlots, { societyId, ...req.body });
    res.status(201).json({ slot });
  })
);

router.post(
  "/slots/:id/block",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN", "SECURITY"),
  asyncHandler(async (req, res) => {
    const { blocked } = req.body as { blocked: boolean };
    const [slot] = await updateReturning(
      schema.parkingSlots,
      { status: blocked ? "BLOCKED" : "FREE" },
      eq(schema.parkingSlots.id, req.params.id)
    );
    emitToSociety(slot.societyId, "parking:updated", { slotId: slot.id, status: slot.status });
    res.json({ slot });
  })
);

router.get(
  "/occupancy",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ free: 0, occupied: 0, blocked: 0, total: 0 });
    const slots = await db.query.parkingSlots.findMany({ where: eq(schema.parkingSlots.societyId, societyId) });
    res.json({
      total: slots.length,
      free: slots.filter((s) => s.status === "FREE").length,
      occupied: slots.filter((s) => s.status === "OCCUPIED").length,
      blocked: slots.filter((s) => s.status === "BLOCKED").length,
    });
  })
);

export default router;
