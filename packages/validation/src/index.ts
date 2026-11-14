import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.enum(["society_fest", "maintenance_meeting", "festival", "private_function"]),
  venue: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
});

export const inviteToEventSchema = z.object({
  mode: z.enum(["SELECTIVE", "BROADCAST"]),
  userIds: z.array(z.string()).optional(), // required when mode === SELECTIVE
  blockIds: z.array(z.string()).optional(), // optional narrowing for BROADCAST
});

export const rsvpSchema = z.object({
  status: z.enum(["YES", "NO", "MAYBE"]),
});

export const generateInviteImageSchema = z.object({
  theme: z.string().min(3),
  style: z.enum(["festive", "formal", "kids", "minimal"]),
});

export const audienceFields = {
  audienceType: z.enum(["ALL", "STREET", "ROAD", "SELECTED"]).optional(),
  blockId: z.string().optional(), // required when audienceType === "STREET"
  roadNo: z.string().optional(), // required when audienceType === "ROAD"
  userIds: z.array(z.string()).optional(), // required when audienceType === "SELECTED"
};

export const createNoticeSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(3),
  category: z.enum(["urgent", "general", "maintenance", "security"]),
  isPinned: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
  ...audienceFields,
});

export const createChargeSchema = z.object({
  label: z.string().min(2).max(20), // short tag, e.g. "Fine-Sep26"
  description: z.string().min(3), // the actual reason, e.g. "Damage to gate near MG Road"
  amount: z.number().positive(),
  dueInDays: z.number().int().positive().default(14),
  ...audienceFields,
});

export const createRazorpayOrderSchema = z.object({
  amount: z.number().positive(),
});

export const verifyRazorpaySchema = z.object({
  razorpay_order_id: z.string().min(3),
  razorpay_payment_id: z.string().min(3),
  razorpay_signature: z.string().min(3),
  amount: z.number().positive(),
});

export const generateBillsSchema = z.object({
  cycleLabel: z.string().min(4), // e.g. "2026-09"
  dueInDays: z.number().int().positive().default(10),
});

export const payBillSchema = z.object({
  amount: z.number().positive(),
  provider: z.enum(["razorpay", "stripe", "mock"]).default("mock"),
});

export const contributeToEventSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional(),
});

export const preApproveGuestSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  vehicleNumber: z.string().optional(),
  purpose: z.string().optional(),
  visitStart: z.string().datetime(),
  visitEnd: z.string().datetime(),
  singleUse: z.boolean().optional(),
});

export const verifyQrSchema = z.object({
  qrToken: z.string().min(10),
});

export const createParkingSlotSchema = z.object({
  code: z.string().min(1),
  zone: z.string().optional(),
  type: z.enum(["GUEST", "RESIDENT", "RESERVED"]).default("GUEST"),
});

export const createStreetSchema = z.object({
  name: z.string().min(1, "Street name is required"),
});

export const createHouseSchema = z.object({
  streetId: z.string().min(1),
  houseNo: z.string().min(1, "House number is required"),
  roadNo: z.string().optional(),
  floor: z.number().int().optional(),
  areaSqft: z.number().positive().optional(),
});

export const createManagedUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.enum(["SOCIETY_ADMIN", "RESIDENT", "SECURITY"]),
  houseId: z.string().optional(), // flat id — required in practice for RESIDENT, optional for SECURITY/admin
  isOwner: z.boolean().optional(),
});

export const addFamilyMemberSchema = z.object({
  name: z.string().min(2),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: z.string().min(6),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

export const broadcastNotificationSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  category: z.enum(["event", "notice", "bill", "payment", "guest", "parking"]),
  channel: z.enum(["in_app", "push", "sms", "email"]).default("in_app"),
  userIds: z.array(z.string()).optional(), // omit for society-wide broadcast
});
