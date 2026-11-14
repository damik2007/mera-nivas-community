import "dotenv/config";
import readline from "readline/promises";
import bcrypt from "bcryptjs";
import { db, insertReturning, pool } from "./client";
import { societies, users } from "./schema";

// Creates one real society and one SOCIETY_ADMIN user. Use this instead of
// `npm run db:seed` (which inserts demo/test data) when setting up a real
// deployment. Run with: npm run create-admin --workspace=@mycommunity/database
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const societyName = await rl.question("Society name (e.g. \"Palm Meadows Society\"): ");
  const address = await rl.question("Society address (optional, press Enter to skip): ");
  const adminName = await rl.question("Admin full name: ");
  const adminEmail = await rl.question("Admin email (used to log in): ");
  const adminPassword = await rl.question("Admin password (min 6 characters): ");
  rl.close();

  if (!societyName || !adminName || !adminEmail || adminPassword.length < 6) {
    console.error("All fields are required and the password must be at least 6 characters. Aborting.");
    process.exit(1);
  }

  const [society] = await insertReturning(societies, { name: societyName, address: address || undefined });
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const [admin] = await insertReturning(users, {
    name: adminName,
    email: adminEmail,
    passwordHash,
    role: "SOCIETY_ADMIN",
    societyId: society.id,
  });

  console.log("\nDone. Created:");
  console.log(` society: ${society.name} (${society.id})`);
  console.log(` admin  : ${admin.email}`);
  console.log("\nLog in at your web app with this email and the password you entered.");
  console.log("From the admin account you can then add blocks, flats, and invite residents.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
