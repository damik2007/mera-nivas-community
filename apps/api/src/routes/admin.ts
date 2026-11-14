import { Router } from "express";
import fs from "node:fs";
import { db, schema, eq, inArray, insertReturning } from "@mycommunity/database";
import { requireAuth, requireRole, hashPassword } from "@mycommunity/auth";
import {
  createStreetSchema,
  createHouseSchema,
  createManagedUserSchema,
  addFamilyMemberSchema,
} from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { documentUpload, documentAbsolutePath, deleteDocumentFile } from "../lib/uploads";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"));

// ---------- Streets (blocks) ----------

router.get(
  "/streets",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ streets: [] });
    const streets = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId) });
    res.json({ streets });
  })
);

router.post(
  "/streets",
  validateBody(createStreetSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) throw new HttpError(400, "Your account has no society assigned");
    const [street] = await insertReturning(schema.blocks, { name: req.body.name, societyId });
    res.status(201).json({ id: street.id });
  })
);

// ---------- Houses (flats) ----------

router.get(
  "/houses",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ houses: [] });
    const streets = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId) });
    const streetIds = streets.map((s) => s.id);
    const houses = streetIds.length
      ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, streetIds) })
      : [];
    res.json({ houses, streets });
  })
);

router.post(
  "/houses",
  validateBody(createHouseSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) throw new HttpError(400, "Your account has no society assigned");
    const street = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, req.body.streetId) });
    if (!street || street.societyId !== societyId) throw new HttpError(404, "Street not found");

    const [house] = await insertReturning(schema.flats, {
      blockId: req.body.streetId,
      number: req.body.houseNo,
      roadNo: req.body.roadNo,
      floor: req.body.floor,
      areaSqft: req.body.areaSqft,
    });
    res.status(201).json({ id: house.id });
  })
);

// ---------- Users (create + assign to a house) ----------

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ users: [] });
    const users = await db.query.users.findMany({
      where: eq(schema.users.societyId, societyId),
      columns: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isOwner: true,
        flatId: true,
        documentLabel: true,
        documentPath: true,
      },
    });
    res.json({
      users: users.map((u) => ({ ...u, hasDocument: Boolean(u.documentPath), documentPath: undefined })),
    });
  })
);

router.post(
  "/users",
  validateBody(createManagedUserSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) throw new HttpError(400, "Your account has no society assigned");
    const { name, email, password, phone, role, houseId, isOwner } = req.body;

    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) throw new HttpError(409, "A user with this email already exists");

    if (houseId) {
      const house = await db.query.flats.findFirst({ where: eq(schema.flats.id, houseId) });
      if (!house) throw new HttpError(404, "House not found");
      const street = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, house.blockId) });
      if (!street || street.societyId !== societyId) throw new HttpError(404, "House not found");
    }

    const passwordHash = await hashPassword(password);
    const [user] = await insertReturning(schema.users, {
      name,
      email,
      phone,
      passwordHash,
      role,
      isOwner: isOwner ?? true,
      societyId,
      flatId: houseId ?? null,
    });

    res.status(201).json({ id: user.id });
  })
);

// ---------- Family members ----------

async function assertManagedUser(userId: string, societyId: string | null) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user || !societyId || user.societyId !== societyId) throw new HttpError(404, "User not found");
  return user;
}

router.get(
  "/users/:id/family",
  asyncHandler(async (req, res) => {
    await assertManagedUser(req.params.id, req.user!.societyId ?? null);
    const members = await db.query.familyMembers.findMany({ where: eq(schema.familyMembers.userId, req.params.id) });
    res.json({ members });
  })
);

router.post(
  "/users/:id/family",
  validateBody(addFamilyMemberSchema),
  asyncHandler(async (req, res) => {
    await assertManagedUser(req.params.id, req.user!.societyId ?? null);
    const [member] = await insertReturning(schema.familyMembers, { userId: req.params.id, ...req.body });
    res.status(201).json({ id: member.id });
  })
);

router.delete(
  "/family/:id",
  asyncHandler(async (req, res) => {
    const member = await db.query.familyMembers.findFirst({ where: eq(schema.familyMembers.id, req.params.id) });
    if (!member) throw new HttpError(404, "Not found");
    await assertManagedUser(member.userId, req.user!.societyId ?? null);
    await db.delete(schema.familyMembers).where(eq(schema.familyMembers.id, req.params.id));
    res.json({ ok: true });
  })
);

// ---------- Legal document (optional) ----------

router.post(
  "/users/:id/document",
  documentUpload.single("document"),
  asyncHandler(async (req, res) => {
    const user = await assertManagedUser(req.params.id, req.user!.societyId ?? null);
    if (!req.file) throw new HttpError(400, "No file uploaded");

    // Replacing an existing document — remove the old file so uploads/ doesn't
    // silently accumulate orphaned files over time.
    if (user.documentPath) deleteDocumentFile(user.documentPath);

    const label = (req.body?.label as string | undefined)?.slice(0, 100) || req.file.originalname.slice(0, 100);
    await db
      .update(schema.users)
      .set({ documentPath: req.file.filename, documentLabel: label })
      .where(eq(schema.users.id, req.params.id));

    res.status(201).json({ ok: true, label });
  })
);

router.get(
  "/users/:id/document",
  asyncHandler(async (req, res) => {
    const user = await assertManagedUser(req.params.id, req.user!.societyId ?? null);
    if (!user.documentPath) throw new HttpError(404, "No document on file");
    const filePath = documentAbsolutePath(user.documentPath);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "No document on file");
    res.download(filePath, user.documentLabel || "document");
  })
);

router.delete(
  "/users/:id/document",
  asyncHandler(async (req, res) => {
    const user = await assertManagedUser(req.params.id, req.user!.societyId ?? null);
    if (user.documentPath) deleteDocumentFile(user.documentPath);
    await db.update(schema.users).set({ documentPath: null, documentLabel: null }).where(eq(schema.users.id, req.params.id));
    res.json({ ok: true });
  })
);

export default router;
