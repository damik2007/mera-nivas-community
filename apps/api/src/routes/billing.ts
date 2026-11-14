import { Router } from "express";
import { and, eq, inArray, desc } from "@mycommunity/database";
import { db, schema, insertReturning } from "@mycommunity/database";
import { requireAuth, requireRole } from "@mycommunity/auth";
import { generateBillsSchema, payBillSchema, createChargeSchema, createRazorpayOrderSchema, verifyRazorpaySchema } from "@mycommunity/validation";
import { asyncHandler, validateBody, HttpError } from "../lib/http";
import { getProvider } from "@mycommunity/payments";
import { renderQrImageDataUrl } from "@mycommunity/qr";
import { razorpayEnabled, getRazorpayKeyId, createRazorpayOrder, verifyRazorpaySignature } from "../services/razorpay";
import { notifyUsers } from "../services/notify";
import { groupBy, indexBy } from "../lib/collections";
import { resolveTargetFlatIds } from "../lib/targeting";

const router = Router();
router.use(requireAuth);

// Fetches line items (with their category) and payments for a set of bills,
// and attaches them. Plain joins instead of Drizzle's relational query
// builder, which emits JSON_ARRAYAGG SQL that MariaDB's parser rejects.
async function attachBillDetails(bills: (typeof schema.bills.$inferSelect)[]) {
  const billIds = bills.map((b) => b.id);
  if (billIds.length === 0) return [];

  const [lineItems, payments] = await Promise.all([
    db.query.billLineItems.findMany({ where: inArray(schema.billLineItems.billId, billIds) }),
    db.query.payments.findMany({ where: inArray(schema.payments.billId, billIds) }),
  ]);
  const categoryIds = [...new Set(lineItems.map((li) => li.categoryId))];
  const categories = categoryIds.length
    ? await db.query.maintenanceCategories.findMany({ where: inArray(schema.maintenanceCategories.id, categoryIds) })
    : [];
  const categoryById = indexBy(categories, (c) => c.id);
  const lineItemsByBill = groupBy(
    lineItems.map((li) => ({ ...li, category: categoryById.get(li.categoryId)! })),
    (li) => li.billId
  );
  const paymentsByBill = groupBy(payments, (p) => p.billId);

  return bills.map((b) => ({
    ...b,
    lineItems: lineItemsByBill.get(b.id) ?? [],
    payments: paymentsByBill.get(b.id) ?? [],
  }));
}

// ---- Maintenance categories ----

router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId;
    if (!societyId) return res.json({ categories: [] });
    const categories = await db.query.maintenanceCategories.findMany({ where: eq(schema.maintenanceCategories.societyId, societyId) });
    res.json({ categories });
  })
);

router.post(
  "/categories",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { name, billingMethod, rate } = req.body as { name: string; billingMethod: any; rate: number };
    const [category] = await insertReturning(schema.maintenanceCategories, {
      societyId: req.user!.societyId!,
      name,
      billingMethod,
      rate,
    });
    res.status(201).json({ category });
  })
);

// ---- Bill generation ----

router.post(
  "/generate",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(generateBillsSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const { cycleLabel, dueInDays } = req.body;

    const blockRows = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId), columns: { id: true } });
    const blockIds = blockRows.map((b) => b.id);
    const flats = blockIds.length
      ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds) })
      : [];
    const categories = await db.query.maintenanceCategories.findMany({ where: eq(schema.maintenanceCategories.societyId, societyId) });
    if (categories.length === 0) throw new HttpError(400, "Define maintenance categories before generating bills");

    const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
    let generatedCount = 0;

    for (const flat of flats) {
      const exists = await db.query.bills.findFirst({
        where: and(eq(schema.bills.flatId, flat.id), eq(schema.bills.cycleLabel, cycleLabel)),
      });
      if (exists) continue;

      const lineItems = categories.map((c) => {
        let amount = c.rate;
        if (c.billingMethod === "PER_SQFT") amount = c.rate * (flat.areaSqft ?? 0);
        if (c.billingMethod === "EQUAL_SPLIT") amount = c.rate / Math.max(flats.length, 1);
        return { categoryId: c.id, amount: Math.round(amount * 100) / 100 };
      });
      const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

      const [bill] = await insertReturning(schema.bills, { flatId: flat.id, cycleLabel, totalAmount, dueDate });
      await db.insert(schema.billLineItems).values(lineItems.map((li) => ({ billId: bill.id, ...li })));
      generatedCount += 1;

      const residents = await db.query.users.findMany({ where: eq(schema.users.flatId, flat.id), columns: { id: true } });
      await notifyUsers(societyId, residents.map((r) => r.id), {
        title: `Maintenance bill ready for ${cycleLabel}`,
        body: `Amount due: ${totalAmount.toFixed(2)} by ${dueDate.toDateString()}.`,
        category: "bill",
      });
    }

    res.status(201).json({ generated: generatedCount });
  })
);

// ---- One-off charges: fines, damage repairs, anything not part of the
// regular maintenance cycle. Same amount is billed to every targeted flat —
// this is not a shared total divided up, it's "everyone targeted owes this
// much". Target everyone, one street, one road, or a hand-picked list. ----

router.post(
  "/charge",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  validateBody(createChargeSchema),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const { label, description, amount, dueInDays, audienceType, blockId, roadNo, userIds } = req.body;

    const flatIds = await resolveTargetFlatIds(societyId, {
      audienceType: audienceType ?? "ALL",
      blockId,
      roadNo,
      userIds,
    });
    if (flatIds.length === 0) throw new HttpError(400, "No residents matched that selection");

    const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
    const created: string[] = [];

    for (const flatId of flatIds) {
      const [bill] = await insertReturning(schema.bills, {
        flatId,
        cycleLabel: label,
        description,
        totalAmount: amount,
        dueDate,
      });
      created.push(bill.id);

      const residents = await db.query.users.findMany({ where: eq(schema.users.flatId, flatId), columns: { id: true } });
      await notifyUsers(societyId, residents.map((r) => r.id), {
        title: `New charge: ${label}`,
        body: `${description} — ${amount.toFixed(2)} due by ${dueDate.toDateString()}.`,
        category: "bill",
      });
    }

    res.status(201).json({ created: created.length });
  })
);

// ---- Bills for a flat ----

router.get(
  "/flat/:flatId",
  asyncHandler(async (req, res) => {
    const bills = await db.query.bills.findMany({
      where: eq(schema.bills.flatId, req.params.flatId),
      orderBy: desc(schema.bills.createdAt),
    });
    res.json({ bills: await attachBillDetails(bills) });
  })
);

router.get(
  "/mine",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const flatId = req.user!.flatId;
    if (!flatId) return res.json({ bills: [] });
    const bills = await db.query.bills.findMany({
      where: eq(schema.bills.flatId, flatId),
      orderBy: desc(schema.bills.createdAt),
    });
    res.json({ bills: await attachBillDetails(bills) });
  })
);

// ---- Payments ----

// Shared by every successful-payment path (mock provider or a verified
// Razorpay payment) — one place that updates amountPaid/status and notifies,
// so the bookkeeping can't drift between payment methods.
async function recordSuccessfulPayment(
  bill: typeof schema.bills.$inferSelect,
  userId: string,
  societyId: string,
  amount: number,
  provider: string,
  providerRefId: string
) {
  const [payment] = await insertReturning(schema.payments, {
    billId: bill.id,
    userId,
    amount,
    provider,
    providerRefId,
    status: "SUCCESS",
  });

  const newPaid = bill.amountPaid + amount;
  const status = newPaid >= bill.totalAmount ? "PAID" : "PARTIAL";
  await db.update(schema.bills).set({ amountPaid: newPaid, status }).where(eq(schema.bills.id, bill.id));

  await notifyUsers(societyId, [userId], {
    title: "Payment received",
    body: `Payment of ${amount.toFixed(2)} recorded for ${bill.cycleLabel}.`,
    category: "payment",
  });

  return { payment, status };
}

router.post(
  "/:billId/pay",
  requireRole("RESIDENT"),
  validateBody(payBillSchema),
  asyncHandler(async (req, res) => {
    const { billId } = req.params;
    const { amount, provider } = req.body;

    const bill = await db.query.bills.findFirst({ where: eq(schema.bills.id, billId) });
    if (!bill) throw new HttpError(404, "Bill not found");

    const charge = await getProvider(provider).charge({
      amount,
      currency: "INR",
      billId,
      description: `Maintenance ${bill.cycleLabel}`,
    });
    if (charge.status !== "SUCCESS") throw new HttpError(402, "Payment failed");

    const { payment, status } = await recordSuccessfulPayment(
      bill,
      req.user!.sub,
      req.user!.societyId!,
      amount,
      provider,
      charge.providerRefId
    );

    res.status(201).json({ payment, billStatus: status });
  })
);

// ---- Razorpay ----
// Real card/UPI/netbanking payments turn on the moment both RAZORPAY_KEY_ID
// and RAZORPAY_KEY_SECRET are set in the API's environment variables —
// nothing else needs redeploying for that switch to take effect.

router.get(
  "/razorpay/config",
  asyncHandler(async (_req, res) => {
    res.json({ enabled: razorpayEnabled, keyId: getRazorpayKeyId() });
  })
);

router.post(
  "/:billId/razorpay/order",
  requireRole("RESIDENT"),
  validateBody(createRazorpayOrderSchema),
  asyncHandler(async (req, res) => {
    if (!razorpayEnabled) throw new HttpError(501, "Online payments are not set up yet — contact your admin.");
    const bill = await db.query.bills.findFirst({ where: eq(schema.bills.id, req.params.billId) });
    if (!bill) throw new HttpError(404, "Bill not found");

    const remaining = bill.totalAmount - bill.amountPaid;
    if (req.body.amount > remaining + 0.01) throw new HttpError(400, "Amount exceeds what's owed on this bill");

    const order = await createRazorpayOrder(req.body.amount, bill.id);
    res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: getRazorpayKeyId() });
  })
);

router.post(
  "/:billId/razorpay/verify",
  requireRole("RESIDENT"),
  validateBody(verifyRazorpaySchema),
  asyncHandler(async (req, res) => {
    if (!razorpayEnabled) throw new HttpError(501, "Online payments are not set up yet — contact your admin.");
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    // The one check that actually matters: recompute the signature ourselves
    // and only trust a match. Everything the browser says otherwise is just
    // a claim, not proof.
    const valid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!valid) throw new HttpError(400, "Payment could not be verified");

    const bill = await db.query.bills.findFirst({ where: eq(schema.bills.id, req.params.billId) });
    if (!bill) throw new HttpError(404, "Bill not found");

    // A payment_id can only ever be recorded once — replaying the same
    // verified payload twice must not double-credit the bill.
    const existing = await db.query.payments.findFirst({ where: eq(schema.payments.providerRefId, razorpay_payment_id) });
    if (existing) return res.status(200).json({ payment: existing, billStatus: bill.status });

    const { payment, status } = await recordSuccessfulPayment(
      bill,
      req.user!.sub,
      req.user!.societyId!,
      amount,
      "razorpay",
      razorpay_payment_id
    );

    res.status(201).json({ payment, billStatus: status });
  })
);

// ---- Receipts ----

const isAdminRole = (role?: string) => role === "SOCIETY_ADMIN" || role === "SUPER_ADMIN";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** e.g. RCT-20261006-A1B2C3 — stable, derived from the payment, unique enough to quote to an admin. */
function receiptNumberFor(paymentId: string, createdAt: Date): string {
  const day = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `RCT-${day}-${paymentId.slice(-6).toUpperCase()}`;
}

/** Order ID printed on the receipt: one order per payment, derived from the payment id so it is stable. */
function orderIdFor(payment: { id: string }): string {
  return `ORD-${payment.id.slice(-8).toUpperCase()}`;
}

// Every payment made by anyone, newest first — residents see their flat's
// payments, admins see the whole society's. Drives the Receipts page.
router.get(
  "/payments",
  requireRole("RESIDENT", "SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const user = req.user!;

    let flatIds: string[] = [];
    if (isAdminRole(user.role)) {
      if (!user.societyId) return res.json({ payments: [] });
      const blockRows = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, user.societyId), columns: { id: true } });
      const blockIds = blockRows.map((b) => b.id);
      const flatRows = blockIds.length
        ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds), columns: { id: true } })
        : [];
      flatIds = flatRows.map((f) => f.id);
    } else if (user.flatId) {
      flatIds = [user.flatId];
    }
    if (flatIds.length === 0) return res.json({ payments: [] });

    const bills = await db.query.bills.findMany({ where: inArray(schema.bills.flatId, flatIds) });
    const billIds = bills.map((b) => b.id);
    if (billIds.length === 0) return res.json({ payments: [] });

    const payments = await db.query.payments.findMany({
      where: inArray(schema.payments.billId, billIds),
      orderBy: desc(schema.payments.createdAt),
      limit: 300,
    });

    const billById = indexBy(bills, (b) => b.id);
    const userIds = [...new Set(payments.map((p) => p.userId))];
    const users = userIds.length ? await db.query.users.findMany({ where: inArray(schema.users.id, userIds), columns: { id: true, name: true } }) : [];
    const userById = indexBy(users, (u) => u.id);

    const usedFlatIds = [...new Set(bills.map((b) => b.flatId))];
    const flats = usedFlatIds.length ? await db.query.flats.findMany({ where: inArray(schema.flats.id, usedFlatIds) }) : [];
    const blockIdsUsed = [...new Set(flats.map((f) => f.blockId))];
    const blocks = blockIdsUsed.length ? await db.query.blocks.findMany({ where: inArray(schema.blocks.id, blockIdsUsed) }) : [];
    const flatById = indexBy(flats, (f) => f.id);
    const blockById = indexBy(blocks, (b) => b.id);

    res.json({
      payments: payments.map((p) => {
        const bill = billById.get(p.billId);
        const flat = bill ? flatById.get(bill.flatId) : undefined;
        const block = flat ? blockById.get(flat.blockId) : undefined;
        return {
          id: p.id,
          receiptNo: receiptNumberFor(p.id, p.createdAt),
          orderId: orderIdFor(p),
          amount: p.amount,
          status: p.status,
          provider: p.provider,
          createdAt: p.createdAt,
          cycleLabel: bill?.cycleLabel ?? "",
          payerName: userById.get(p.userId)?.name ?? "Resident",
          flatLabel: flat ? `${block?.name ?? ""} · ${flat.number}`.replace(/^ · /, "") : "",
        };
      }),
    });
  })
);

// One receipt, as structured data. The web app renders it as a printable,
// downloadable receipt (PDF / image) — see apps/web/src/components/ReceiptPaper.tsx.
router.get(
  "/payments/:paymentId/receipt",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, req.params.paymentId) });
    if (!payment) throw new HttpError(404, "Payment not found");

    const [bill, payer] = await Promise.all([
      db.query.bills.findFirst({ where: eq(schema.bills.id, payment.billId) }),
      db.query.users.findFirst({ where: eq(schema.users.id, payment.userId) }),
    ]);
    if (!bill || !payer) throw new HttpError(404, "Payment details not found");

    const flat = await db.query.flats.findFirst({ where: eq(schema.flats.id, bill.flatId) });
    const block = flat ? await db.query.blocks.findFirst({ where: eq(schema.blocks.id, flat.blockId) }) : null;
    const society = block ? await db.query.societies.findFirst({ where: eq(schema.societies.id, block.societyId) }) : null;

    // Who may open this receipt: the person who paid, anyone living in the same
    // flat, and the society's admins. Nobody else, even with a valid login.
    const allowed =
      payment.userId === user.sub ||
      (Boolean(user.flatId) && user.flatId === bill.flatId) ||
      (isAdminRole(user.role) && (user.role === "SUPER_ADMIN" || (Boolean(user.societyId) && user.societyId === block?.societyId)));
    if (!allowed) throw new HttpError(403, "You don't have access to this receipt");

    const [siblingPayments, lineItems] = await Promise.all([
      db.query.payments.findMany({ where: eq(schema.payments.billId, bill.id) }),
      db.query.billLineItems.findMany({ where: eq(schema.billLineItems.billId, bill.id) }),
    ]);
    const categoryIds = [...new Set(lineItems.map((li) => li.categoryId))];
    const categories = categoryIds.length
      ? await db.query.maintenanceCategories.findMany({ where: inArray(schema.maintenanceCategories.id, categoryIds) })
      : [];
    const categoryById = indexBy(categories, (c) => c.id);

    // What had been paid on this bill *before* this payment, so the receipt
    // shows the balance as it stood at the time — not today's balance.
    const successful = siblingPayments
      .filter((p) => p.status === "SUCCESS")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const position = successful.findIndex((p) => p.id === payment.id);
    const earlier = position >= 0 ? successful.slice(0, position) : successful.filter((p) => p.createdAt < payment.createdAt);
    const paidBefore = round2(earlier.reduce((sum, p) => sum + p.amount, 0));
    const paidAfter = round2(payment.status === "SUCCESS" ? paidBefore + payment.amount : paidBefore);

    const receiptNo = receiptNumberFor(payment.id, payment.createdAt);
    const orderId = orderIdFor(payment);

    const qr = await renderQrImageDataUrl(
      [
        "MERA NIVAS RECEIPT",
        `No: ${receiptNo}`,
        `Order: ${orderId}`,
        `Payment: ${payment.providerRefId ?? payment.id}`,
        `Amount: INR ${payment.amount.toFixed(2)}`,
        `Status: ${payment.status}`,
        `Date: ${payment.createdAt.toISOString()}`,
      ].join("\n")
    );

    res.json({
      receipt: {
        receiptNo,
        orderId,
        paymentId: payment.providerRefId ?? payment.id,
        internalId: payment.id,
        issuedAt: payment.createdAt.toISOString(),
        status: payment.status,
        amount: payment.amount,
        currency: "INR",
        method: payment.provider,
        society: { name: society?.name ?? "Mera Nivas", address: society?.address ?? null },
        payer: { name: payer.name, email: payer.email, phone: payer.phone ?? null },
        flat: flat
          ? { street: block?.name ?? "", number: flat.number, roadNo: flat.roadNo ?? null, floor: flat.floor ?? null }
          : null,
        bill: {
          id: bill.id,
          cycleLabel: bill.cycleLabel,
          description: bill.description ?? null,
          totalAmount: bill.totalAmount,
          dueDate: bill.dueDate.toISOString(),
          lineItems: lineItems.map((li) => ({ name: categoryById.get(li.categoryId)?.name ?? "Charge", amount: li.amount })),
          paidBefore,
          paidAfter,
          balance: round2(Math.max(bill.totalAmount - paidAfter, 0)),
        },
        qr,
      },
    });
  })
);

// ---- Admin dashboard ----

router.get(
  "/dashboard",
  requireRole("SOCIETY_ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const societyId = req.user!.societyId!;
    const blockRows = await db.query.blocks.findMany({ where: eq(schema.blocks.societyId, societyId), columns: { id: true } });
    const blockIds = blockRows.map((b) => b.id);
    const flatRows = blockIds.length
      ? await db.query.flats.findMany({ where: inArray(schema.flats.blockId, blockIds), columns: { id: true } })
      : [];
    const flatIds = flatRows.map((f) => f.id);

    const billRows = flatIds.length
      ? await db.query.bills.findMany({ where: inArray(schema.bills.flatId, flatIds) })
      : [];
    const bills = await attachBillDetails(billRows);

    const totalBilled = bills.reduce((s, b) => s + b.totalAmount, 0);
    const totalCollected = bills.reduce((s, b) => s + b.amountPaid, 0);
    const outstanding = totalBilled - totalCollected;

    const byCategory: Record<string, number> = {};
    for (const b of bills) {
      for (const li of b.lineItems) {
        byCategory[li.category.name] = (byCategory[li.category.name] || 0) + li.amount;
      }
    }

    res.json({
      totalBilled,
      totalCollected,
      outstanding,
      byCategory,
      overdueCount: bills.filter((b) => b.status !== "PAID" && b.dueDate < new Date()).length,
    });
  })
);

export default router;
