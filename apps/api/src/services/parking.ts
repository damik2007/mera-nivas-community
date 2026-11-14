import { and, asc, eq, inArray, isNull } from "@mycommunity/database";
import { db, schema } from "@mycommunity/database";
import { createId } from "@paralleldrive/cuid2";
import { emitToSociety } from "../lib/realtime";

/**
 * Allots the next available free slot for a guest approval. Strategy is
 * "nearest zone first, then lowest code" — a simple deterministic ordering
 * that approximates nearest-to-block without needing real geo data.
 */
export async function allotParkingSlot(societyId: string, guestApprovalId: string) {
  const slot = await db.query.parkingSlots.findFirst({
    where: and(
      eq(schema.parkingSlots.societyId, societyId),
      eq(schema.parkingSlots.status, "FREE"),
      inArray(schema.parkingSlots.type, ["GUEST", "RESERVED"])
    ),
    orderBy: [asc(schema.parkingSlots.zone), asc(schema.parkingSlots.code)],
  });
  if (!slot) return null;

  await db.update(schema.parkingSlots).set({ status: "OCCUPIED" }).where(eq(schema.parkingSlots.id, slot.id));

  // guestApprovalId is UNIQUE on this table, so a returning multi-use guest's
  // second (or later) visit must UPDATE their one existing row, never INSERT
  // a fresh one — a plain insert here would throw a duplicate-key error and
  // crash the check-in, since a row for this approval already exists from
  // their first visit.
  await db
    .insert(schema.parkingAllotments)
    .values({ id: createId(), guestApprovalId, slotId: slot.id })
    .onDuplicateKeyUpdate({ set: { slotId: slot.id, allottedAt: new Date(), releasedAt: null } });
  const [allotment] = await db.select().from(schema.parkingAllotments).where(eq(schema.parkingAllotments.guestApprovalId, guestApprovalId));

  emitToSociety(societyId, "parking:updated", { slotId: slot.id, status: "OCCUPIED" });
  return { slot: { ...slot, status: "OCCUPIED" as const }, allotment };
}

export async function releaseParkingSlotForApproval(societyId: string, guestApprovalId: string) {
  // A multi-use pass can be allotted a new slot on every return visit, so
  // there can be several allotment rows for the same approval over time —
  // always release the current (not-yet-released) one, never just the first
  // row found, or a later visit could release an already-closed old slot.
  const allotment = await db.query.parkingAllotments.findFirst({
    where: and(eq(schema.parkingAllotments.guestApprovalId, guestApprovalId), isNull(schema.parkingAllotments.releasedAt)),
  });
  if (!allotment) return;

  await db
    .update(schema.parkingAllotments)
    .set({ releasedAt: new Date() })
    .where(eq(schema.parkingAllotments.id, allotment.id));
  await db.update(schema.parkingSlots).set({ status: "FREE" }).where(eq(schema.parkingSlots.id, allotment.slotId));

  emitToSociety(societyId, "parking:updated", { slotId: allotment.slotId, status: "FREE" });
}
