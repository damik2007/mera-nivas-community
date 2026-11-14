import { Router } from "express";
import { eq, inArray } from "@mycommunity/database";
import { db, schema } from "@mycommunity/database";
import { requireAuth } from "@mycommunity/auth";
import { asyncHandler } from "../lib/http";
import { groupBy } from "../lib/collections";

const router = Router();
router.use(requireAuth);

// Full block -> flat -> resident tree, with optional text search (name/flat number).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ blocks: [] });
    const q = (req.query.q as string | undefined)?.toLowerCase();

    const blockRows = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId) });
    const blockIds = blockRows.map((b) => b.id);

    const flatRows = blockIds.length ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds) }) : [];
    const flatIds = flatRows.map((f) => f.id);

    const userRows = flatIds.length
      ? await db.query.users.findMany({
          where: inArray(schema.users.flatId, flatIds),
          columns: { id: true, name: true, role: true, isOwner: true, email: true, flatId: true },
        })
      : [];

    const usersByFlat = groupBy(userRows, (u) => u.flatId!);
    const flatsByBlock = groupBy(
      flatRows.map((f) => ({ ...f, users: usersByFlat.get(f.id) ?? [] })),
      (f) => f.blockId
    );

    let blocks = blockRows.map((b) => ({ ...b, flats: flatsByBlock.get(b.id) ?? [] }));

    if (q) {
      blocks = blocks
        .map((b) => ({
          ...b,
          flats: b.flats.filter(
            (f) => f.number.toLowerCase().includes(q) || f.users.some((u) => u.name.toLowerCase().includes(q))
          ),
        }))
        .filter((b) => b.flats.length > 0);
    }

    res.json({ blocks });
  })
);

export default router;
