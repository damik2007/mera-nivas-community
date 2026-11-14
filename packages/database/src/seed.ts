import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, insertReturning, pool } from "./client";
import {
  societies,
  blocks,
  flats,
  users,
  maintenanceCategories,
  bills,
  billLineItems,
  parkingSlots,
  notices,
} from "./schema";

const DEMO_PASSWORD = "Passw0rd!"; // same password for every seeded demo account

async function main() {
  console.log("Seeding MyCommunity demo data...");

  const [society] = await insertReturning(societies, { name: "Palm Meadows Society", address: "Sector 12, Green City" });

  const [blockA] = await insertReturning(blocks, { name: "A Wing", societyId: society.id });
  const [blockB] = await insertReturning(blocks, { name: "B Wing", societyId: society.id });

  const flatRows = [];
  for (const f of [
    { number: "101", floor: 1, areaSqft: 950, blockId: blockA.id },
    { number: "102", floor: 1, areaSqft: 950, blockId: blockA.id },
    { number: "201", floor: 2, areaSqft: 1100, blockId: blockA.id },
    { number: "202", floor: 2, areaSqft: 1100, blockId: blockA.id },
    { number: "101", floor: 1, areaSqft: 900, blockId: blockB.id },
    { number: "201", floor: 2, areaSqft: 1050, blockId: blockB.id },
  ]) {
    const [row] = await insertReturning(flats, f);
    flatRows.push(row);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [superAdmin] = await insertReturning(users, {
    name: "Asha Rao",
    email: "superadmin@mycommunity.test",
    passwordHash,
    role: "SUPER_ADMIN",
  });

  const [admin] = await insertReturning(users, {
    name: "Vikram Shah",
    email: "admin@mycommunity.test",
    passwordHash,
    role: "SOCIETY_ADMIN",
    societyId: society.id,
  });

  const [resident] = await insertReturning(users, {
    name: "Priya Menon",
    email: "resident@mycommunity.test",
    passwordHash,
    role: "RESIDENT",
    societyId: society.id,
    flatId: flatRows[2].id, // A-201
    isOwner: true,
  });

  const [resident2] = await insertReturning(users, {
    name: "Karan Verma",
    email: "resident2@mycommunity.test",
    passwordHash,
    role: "RESIDENT",
    societyId: society.id,
    flatId: flatRows[0].id, // A-101
    isOwner: false,
  });

  const [guard] = await insertReturning(users, {
    name: "Ramesh Kumar",
    email: "guard@mycommunity.test",
    passwordHash,
    role: "SECURITY",
    societyId: society.id,
  });

  const categoryRows = [];
  for (const c of [
    { name: "Common electricity", billingMethod: "EQUAL_SPLIT" as const, rate: 1200 },
    { name: "Security & watchman", billingMethod: "FLAT_RATE" as const, rate: 800 },
    { name: "Sinking fund", billingMethod: "PER_SQFT" as const, rate: 1.5 },
    { name: "Fest fund", billingMethod: "FLAT_RATE" as const, rate: 200 },
  ]) {
    const [row] = await insertReturning(maintenanceCategories, { ...c, societyId: society.id });
    categoryRows.push(row);
  }

  // Generate a bill for the resident's flat for the current cycle
  const cycleLabel = new Date().toISOString().slice(0, 7);
  const targetFlat = flatRows[2];
  const lineAmounts = [
    categoryRows[0].rate / flatRows.length,
    categoryRows[1].rate,
    categoryRows[2].rate * (targetFlat.areaSqft ?? 1000),
    categoryRows[3].rate,
  ];
  const total = lineAmounts.reduce((a, b) => a + b, 0);

  const [bill] = await insertReturning(bills, {
    flatId: targetFlat.id,
    cycleLabel,
    totalAmount: Math.round(total * 100) / 100,
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    status: "PENDING",
  });

  for (let i = 0; i < categoryRows.length; i++) {
    await db.insert(billLineItems).values({
      billId: bill.id,
      categoryId: categoryRows[i].id,
      amount: Math.round(lineAmounts[i] * 100) / 100,
    });
  }

  // Parking slot pool
  for (let i = 0; i < 10; i++) {
    await db.insert(parkingSlots).values({
      societyId: society.id,
      code: `P${i + 1}`,
      zone: i < 5 ? "Zone A" : "Zone B",
      type: "GUEST",
      status: "FREE",
    });
  }

  // A sample notice
  await db.insert(notices).values({
    societyId: society.id,
    authorId: admin.id,
    title: "Water supply maintenance on Sunday",
    body: "Water supply will be interrupted from 10 AM to 2 PM on Sunday for tank cleaning.",
    category: "maintenance",
    isPinned: true,
  });

  console.log(`Seed complete. Demo accounts (password for all: ${DEMO_PASSWORD}):`);
  console.log(" super admin  :", superAdmin.email);
  console.log(" society admin:", admin.email);
  console.log(" resident     :", resident.email, "(A-201, owner)");
  console.log(" resident 2   :", resident2.email, "(A-101, tenant)");
  console.log(" security     :", guard.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
