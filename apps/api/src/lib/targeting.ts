import { db, schema, eq, inArray } from "@mycommunity/database";

export type AudienceType = "ALL" | "STREET" | "ROAD" | "SELECTED";

export interface AudienceSpec {
  audienceType: AudienceType;
  blockId?: string;
  roadNo?: string;
  userIds?: string[];
}

/** Every flat in the society, tagged with its street (block) id and road number. */
async function allFlats(societyId: string) {
  const blocks = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId) });
  const blockIds = blocks.map((b) => b.id);
  const flats = blockIds.length ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds) }) : [];
  return flats;
}

/**
 * Resolves an audience selection down to the actual flat ids it covers.
 * SELECTED is resolved via the chosen users' own flats, not stored directly —
 * a resident isn't guaranteed to still be at the same flat forever, so this
 * always reflects who's there right now.
 */
export async function resolveTargetFlatIds(societyId: string, spec: AudienceSpec): Promise<string[]> {
  if (spec.audienceType === "SELECTED") {
    if (!spec.userIds?.length) return [];
    const users = await db.query.users.findMany({
      where: inArray(schema.users.id, spec.userIds),
    });
    return [...new Set(users.filter((u) => u.societyId === societyId && u.flatId).map((u) => u.flatId as string))];
  }

  const flats = await allFlats(societyId);
  if (spec.audienceType === "STREET") {
    if (!spec.blockId) return [];
    return flats.filter((f) => f.blockId === spec.blockId).map((f) => f.id);
  }
  if (spec.audienceType === "ROAD") {
    if (!spec.roadNo) return [];
    return flats.filter((f) => f.roadNo === spec.roadNo).map((f) => f.id);
  }
  // ALL
  return flats.map((f) => f.id);
}

/** Resolves an audience selection to the resident/owner user ids it covers (for notices). */
export async function resolveTargetUserIds(societyId: string, spec: AudienceSpec): Promise<string[]> {
  if (spec.audienceType === "SELECTED") {
    if (!spec.userIds?.length) return [];
    const users = await db.query.users.findMany({ where: inArray(schema.users.id, spec.userIds) });
    return users.filter((u) => u.societyId === societyId).map((u) => u.id);
  }
  const flatIds = await resolveTargetFlatIds(societyId, spec);
  if (flatIds.length === 0) return [];
  const users = await db.query.users.findMany({ where: inArray(schema.users.flatId, flatIds) });
  return users.map((u) => u.id);
}
