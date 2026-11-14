import { mysqlTable, varchar, text, int, double, boolean, datetime, mysqlEnum, unique } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const id = () => varchar("id", { length: 36 }).primaryKey().$defaultFn(() => createId());
const fk = (name: string) => varchar(name, { length: 36 });
const createdAt = () => datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date());

// ---------- Directory ----------

export const societies = mysqlTable("societies", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 255 }),
  createdAt: createdAt(),
});

export const blocks = mysqlTable("blocks", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  societyId: fk("society_id").notNull().references(() => societies.id),
});

export const flats = mysqlTable("flats", {
  id: id(),
  number: varchar("number", { length: 50 }).notNull(), // the house number
  roadNo: varchar("road_no", { length: 50 }), // optional road number within the street/block
  floor: int("floor"),
  areaSqft: double("area_sqft"),
  blockId: fk("block_id").notNull().references(() => blocks.id), // the street
});

// ---------- Identity ----------

export const users = mysqlTable("users", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["SUPER_ADMIN", "SOCIETY_ADMIN", "RESIDENT", "SECURITY"]).notNull(),
  isOwner: boolean("is_owner").notNull().default(true),
  societyId: fk("society_id").references(() => societies.id),
  flatId: fk("flat_id").references(() => flats.id),
  // Optional legal document (sale deed, rental agreement, ID proof) uploaded by an
  // admin. documentPath is a server-side file path, never served directly — always
  // downloaded through an authenticated route. documentLabel is just a human name
  // for it, e.g. "Sale deed".
  documentPath: varchar("document_path", { length: 500 }),
  documentLabel: varchar("document_label", { length: 100 }),
  // Bumped on every password change/reset. Stamped into password-reset tokens
  // at send-time, so a reset link becomes worthless the moment the password
  // it was meant for has already been changed some other way.
  passwordVersion: int("password_version").notNull().default(0),
  createdAt: createdAt(),
});

// ---------- Family members ----------
// Household members of a resident/owner account. Not login accounts themselves —
// just contact/identity records an admin keeps against the primary account.

export const familyMembers = mysqlTable("family_members", {
  id: id(),
  userId: fk("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  gender: mysqlEnum("gender", ["MALE", "FEMALE", "OTHER"]).notNull(),
  mobile: varchar("mobile", { length: 30 }).notNull(),
  createdAt: createdAt(),
});

export const refreshTokens = mysqlTable("refresh_tokens", {
  id: id(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  userId: fk("user_id").notNull().references(() => users.id),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: createdAt(),
});

// ---------- Events ----------

export const events = mysqlTable("events", {
  id: id(),
  societyId: fk("society_id").notNull().references(() => societies.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  venue: varchar("venue", { length: 255 }),
  startsAt: datetime("starts_at", { mode: "date" }).notNull(),
  endsAt: datetime("ends_at", { mode: "date" }),
  bannerUrl: text("banner_url"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceRule: varchar("recurrence_rule", { length: 100 }),
  // Who posted the event — an admin, or a resident organizing something of
  // their own (a get-together, a private function) and inviting whoever they
  // choose. Null on events created before this column existed; those are
  // treated as admin/legacy events.
  createdByUserId: fk("created_by_user_id").references(() => users.id),
  createdAt: createdAt(),
});

export const eventInvitations = mysqlTable(
  "event_invitations",
  {
    id: id(),
    eventId: fk("event_id").notNull().references(() => events.id),
    userId: fk("user_id").notNull().references(() => users.id),
    mode: mysqlEnum("mode", ["SELECTIVE", "BROADCAST"]).notNull(),
    rsvpStatus: mysqlEnum("rsvp_status", ["PENDING", "YES", "NO", "MAYBE"]).notNull().default("PENDING"),
    respondedAt: datetime("responded_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: unique().on(t.eventId, t.userId) })
);

export const invitationImages = mysqlTable("invitation_images", {
  id: id(),
  eventId: fk("event_id").notNull().references(() => events.id),
  imageUrl: text("image_url").notNull(),
  promptUsed: text("prompt_used"),
  source: mysqlEnum("source", ["ai", "template"]).notNull(),
  selected: boolean("selected").notNull().default(false),
  createdAt: createdAt(),
});

export const eventFundContributions = mysqlTable("event_fund_contributions", {
  id: id(),
  eventId: fk("event_id").notNull().references(() => events.id),
  userId: fk("user_id").notNull().references(() => users.id),
  amount: double("amount").notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: createdAt(),
});

// ---------- Notice board ----------

export const notices = mysqlTable("notices", {
  id: id(),
  societyId: fk("society_id").notNull().references(() => societies.id),
  authorId: fk("author_id").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  category: mysqlEnum("category", ["urgent", "general", "maintenance", "security"]).notNull(),
  // attachmentUrl holds a server-side stored filename (like users.documentPath),
  // never served directly — only through the authenticated attachment route.
  attachmentUrl: text("attachment_url"),
  attachmentLabel: varchar("attachment_label", { length: 100 }),
  isPinned: boolean("is_pinned").notNull().default(false),
  expiresAt: datetime("expires_at", { mode: "date" }),
  // Who this notice is addressed to. ALL = every resident (the old default
  // behavior). STREET/ROAD narrow it to one street or one road number.
  // SELECTED means only the specific people listed in notice_recipients.
  audienceType: mysqlEnum("audience_type", ["ALL", "STREET", "ROAD", "SELECTED"]).notNull().default("ALL"),
  audienceBlockId: fk("audience_block_id").references(() => blocks.id),
  audienceRoadNo: varchar("audience_road_no", { length: 50 }),
  createdAt: createdAt(),
});

export const noticeRecipients = mysqlTable("notice_recipients", {
  id: id(),
  noticeId: fk("notice_id").notNull().references(() => notices.id),
  userId: fk("user_id").notNull().references(() => users.id),
});

export const noticeReadReceipts = mysqlTable(
  "notice_read_receipts",
  {
    id: id(),
    noticeId: fk("notice_id").notNull().references(() => notices.id),
    userId: fk("user_id").notNull().references(() => users.id),
    readAt: datetime("read_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ uniq: unique().on(t.noticeId, t.userId) })
);

// ---------- Billing ----------

export const maintenanceCategories = mysqlTable("maintenance_categories", {
  id: id(),
  societyId: fk("society_id").notNull().references(() => societies.id),
  name: varchar("name", { length: 255 }).notNull(),
  billingMethod: mysqlEnum("billing_method", ["FLAT_RATE", "PER_SQFT", "EQUAL_SPLIT"]).notNull(),
  rate: double("rate").notNull(),
});

export const bills = mysqlTable("bills", {
  id: id(),
  flatId: fk("flat_id").notNull().references(() => flats.id),
  cycleLabel: varchar("cycle_label", { length: 20 }).notNull(),
  // A longer explanation for one-off charges (a fine, road-damage repair
  // cost) — cycleLabel is too short (20 chars) to hold a real reason.
  description: text("description"),
  totalAmount: double("total_amount").notNull(),
  amountPaid: double("amount_paid").notNull().default(0),
  status: mysqlEnum("status", ["PENDING", "PARTIAL", "PAID", "OVERDUE"]).notNull().default("PENDING"),
  dueDate: datetime("due_date", { mode: "date" }).notNull(),
  createdAt: createdAt(),
});

export const billLineItems = mysqlTable("bill_line_items", {
  id: id(),
  billId: fk("bill_id").notNull().references(() => bills.id),
  categoryId: fk("category_id").notNull().references(() => maintenanceCategories.id),
  amount: double("amount").notNull(),
});

// Every sign-in attempt, successful or not — including a Google sign-in for
// an email with no matching account, or a wrong password. userId is filled in
// only when the attempt matched a real account; email is kept as typed either
// way, so a failed attempt against a non-existent address is still on record.
export const authEvents = mysqlTable("auth_events", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull(),
  method: mysqlEnum("method", ["PASSWORD", "GOOGLE"]).notNull(),
  success: boolean("success").notNull(),
  reason: varchar("reason", { length: 100 }), // e.g. "no_account", "wrong_password", "unverified_email"
  userId: fk("user_id").references(() => users.id),
  ip: varchar("ip", { length: 64 }),
  createdAt: createdAt(),
});

export const payments = mysqlTable("payments", {
  id: id(),
  billId: fk("bill_id").notNull().references(() => bills.id),
  userId: fk("user_id").notNull().references(() => users.id),
  amount: double("amount").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerRefId: varchar("provider_ref_id", { length: 255 }),
  status: mysqlEnum("status", ["PENDING", "SUCCESS", "FAILED"]).notNull().default("SUCCESS"),
  receiptUrl: text("receipt_url"),
  createdAt: createdAt(),
});

// ---------- Guests, QR, parking ----------

export const guests = mysqlTable("guests", {
  id: id(),
  flatId: fk("flat_id").notNull().references(() => flats.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  purpose: varchar("purpose", { length: 255 }),
  createdAt: createdAt(),
});

export const guestApprovals = mysqlTable("guest_approvals", {
  id: id(),
  guestId: fk("guest_id").notNull().references(() => guests.id),
  approvedById: fk("approved_by_id").notNull().references(() => users.id),
  qrToken: varchar("qr_token", { length: 512 }).notNull().unique(),
  visitStart: datetime("visit_start", { mode: "date" }).notNull(),
  visitEnd: datetime("visit_end", { mode: "date" }).notNull(),
  singleUse: boolean("single_use").notNull().default(true),
  // CHECKED_IN = currently on the premises (set by the inward gate scan, parking
  // allotted). The next scan of the same code checks them back out again
  // (USED, parking released). For a multi-use pass, a later visit moves them
  // from USED back to CHECKED_IN, same as the first time.
  status: mysqlEnum("status", ["APPROVED", "CHECKED_IN", "USED", "EXPIRED", "REVOKED", "DENIED"]).notNull().default("APPROVED"),
  revokedAt: datetime("revoked_at", { mode: "date" }),
  scannedById: fk("scanned_by_id").references(() => users.id),
  checkedInAt: datetime("checked_in_at", { mode: "date" }),
  checkedOutAt: datetime("checked_out_at", { mode: "date" }),
  denyReason: varchar("deny_reason", { length: 255 }),
  createdAt: createdAt(),
});

export const parkingSlots = mysqlTable(
  "parking_slots",
  {
    id: id(),
    societyId: fk("society_id").notNull().references(() => societies.id),
    code: varchar("code", { length: 20 }).notNull(),
    zone: varchar("zone", { length: 50 }),
    type: mysqlEnum("type", ["GUEST", "RESIDENT", "RESERVED"]).notNull().default("GUEST"),
    status: mysqlEnum("status", ["FREE", "OCCUPIED", "BLOCKED"]).notNull().default("FREE"),
    flatId: fk("flat_id").references(() => flats.id),
  },
  (t) => ({ uniq: unique().on(t.societyId, t.code) })
);

export const parkingAllotments = mysqlTable("parking_allotments", {
  id: id(),
  guestApprovalId: fk("guest_approval_id").notNull().unique().references(() => guestApprovals.id),
  slotId: fk("slot_id").notNull().references(() => parkingSlots.id),
  allottedAt: datetime("allotted_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  releasedAt: datetime("released_at", { mode: "date" }),
});

// ---------- Notifications ----------

export const notifications = mysqlTable("notifications", {
  id: id(),
  societyId: fk("society_id").notNull().references(() => societies.id),
  userId: fk("user_id").references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  channel: mysqlEnum("channel", ["in_app", "push", "sms", "email"]).notNull(),
  status: mysqlEnum("status", ["QUEUED", "SENT", "FAILED"]).notNull().default("SENT"),
  createdAt: createdAt(),
});

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: id(),
    userId: fk("user_id").notNull().references(() => users.id),
    category: varchar("category", { length: 50 }).notNull(),
    channel: mysqlEnum("channel", ["in_app", "push", "sms", "email"]).notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => ({ uniq: unique().on(t.userId, t.category, t.channel) })
);

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  userId: fk("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 36 }),
  metadata: text("metadata"),
  createdAt: createdAt(),
});

// ---------- Relations (enables db.query.x.findMany({ with: {...} })) ----------

export const societiesRelations = relations(societies, ({ many }) => ({
  blocks: many(blocks),
  users: many(users),
  events: many(events),
  notices: many(notices),
  categories: many(maintenanceCategories),
  parkingSlots: many(parkingSlots),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  society: one(societies, { fields: [blocks.societyId], references: [societies.id] }),
  flats: many(flats),
}));

export const flatsRelations = relations(flats, ({ one, many }) => ({
  block: one(blocks, { fields: [flats.blockId], references: [blocks.id] }),
  users: many(users),
  bills: many(bills),
  guests: many(guests),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  society: one(societies, { fields: [users.societyId], references: [societies.id] }),
  flat: one(flats, { fields: [users.flatId], references: [flats.id] }),
  invitations: many(eventInvitations),
  payments: many(payments),
  familyMembers: many(familyMembers),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  user: one(users, { fields: [familyMembers.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  society: one(societies, { fields: [events.societyId], references: [societies.id] }),
  creator: one(users, { fields: [events.createdByUserId], references: [users.id] }),
  invitations: many(eventInvitations),
  invitationImages: many(invitationImages),
  fundContributions: many(eventFundContributions),
}));

export const eventInvitationsRelations = relations(eventInvitations, ({ one }) => ({
  event: one(events, { fields: [eventInvitations.eventId], references: [events.id] }),
  user: one(users, { fields: [eventInvitations.userId], references: [users.id] }),
}));

export const invitationImagesRelations = relations(invitationImages, ({ one }) => ({
  event: one(events, { fields: [invitationImages.eventId], references: [events.id] }),
}));

export const noticesRelations = relations(notices, ({ one, many }) => ({
  society: one(societies, { fields: [notices.societyId], references: [societies.id] }),
  author: one(users, { fields: [notices.authorId], references: [users.id] }),
  audienceBlock: one(blocks, { fields: [notices.audienceBlockId], references: [blocks.id] }),
  reads: many(noticeReadReceipts),
  recipients: many(noticeRecipients),
}));

export const noticeRecipientsRelations = relations(noticeRecipients, ({ one }) => ({
  notice: one(notices, { fields: [noticeRecipients.noticeId], references: [notices.id] }),
  user: one(users, { fields: [noticeRecipients.userId], references: [users.id] }),
}));

export const noticeReadReceiptsRelations = relations(noticeReadReceipts, ({ one }) => ({
  notice: one(notices, { fields: [noticeReadReceipts.noticeId], references: [notices.id] }),
  user: one(users, { fields: [noticeReadReceipts.userId], references: [users.id] }),
}));

export const maintenanceCategoriesRelations = relations(maintenanceCategories, ({ many }) => ({
  lineItems: many(billLineItems),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  flat: one(flats, { fields: [bills.flatId], references: [flats.id] }),
  lineItems: many(billLineItems),
  payments: many(payments),
}));

export const billLineItemsRelations = relations(billLineItems, ({ one }) => ({
  bill: one(bills, { fields: [billLineItems.billId], references: [bills.id] }),
  category: one(maintenanceCategories, { fields: [billLineItems.categoryId], references: [maintenanceCategories.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
}));

export const guestsRelations = relations(guests, ({ one, many }) => ({
  flat: one(flats, { fields: [guests.flatId], references: [flats.id] }),
  approvals: many(guestApprovals),
}));

export const guestApprovalsRelations = relations(guestApprovals, ({ one }) => ({
  guest: one(guests, { fields: [guestApprovals.guestId], references: [guests.id] }),
  approvedBy: one(users, { fields: [guestApprovals.approvedById], references: [users.id] }),
  scannedBy: one(users, { fields: [guestApprovals.scannedById], references: [users.id] }),
  allotment: one(parkingAllotments, {
    fields: [guestApprovals.id],
    references: [parkingAllotments.guestApprovalId],
  }),
}));

export const parkingSlotsRelations = relations(parkingSlots, ({ one, many }) => ({
  society: one(societies, { fields: [parkingSlots.societyId], references: [societies.id] }),
  flat: one(flats, { fields: [parkingSlots.flatId], references: [flats.id] }),
  allotments: many(parkingAllotments),
}));

export const parkingAllotmentsRelations = relations(parkingAllotments, ({ one }) => ({
  guestApproval: one(guestApprovals, { fields: [parkingAllotments.guestApprovalId], references: [guestApprovals.id] }),
  slot: one(parkingSlots, { fields: [parkingAllotments.slotId], references: [parkingSlots.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  society: one(societies, { fields: [notifications.societyId], references: [societies.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
}));
