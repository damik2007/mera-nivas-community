import readline from "readline/promises";
import { writeFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";

// Generates a SQL file that creates one society and one SOCIETY_ADMIN login.
// It never touches a database: you paste/import the resulting file in phpMyAdmin.
// Run with:  npm run db:admin-sql   (from the repo root)

// Escape a value for use inside a single-quoted MySQL string.
const sql = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const societyName = (await rl.question('Society name (e.g. "Palm Meadows Society"): ')).trim();
  const address = (await rl.question("Society address (optional, press Enter to skip): ")).trim();
  const adminName = (await rl.question("Admin full name: ")).trim();
  const adminEmail = (await rl.question("Admin email (used to log in): ")).trim();
  const adminPassword = await rl.question("Admin password (min 6 characters): ");
  rl.close();

  if (!societyName || !adminName || !adminEmail || adminPassword.length < 6) {
    console.error("All fields are required and the password must be at least 6 characters. Aborting.");
    process.exit(1);
  }

  const societyId = createId();
  const adminId = createId();
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const statements = `-- MyCommunity: first society + admin login. Import this in phpMyAdmin (Import tab, or paste into the SQL tab).
INSERT INTO \`societies\` (\`id\`, \`name\`, \`address\`, \`created_at\`)
VALUES (${sql(societyId)}, ${sql(societyName)}, ${address ? sql(address) : "NULL"}, NOW());

INSERT INTO \`users\` (\`id\`, \`name\`, \`email\`, \`phone\`, \`password_hash\`, \`role\`, \`is_owner\`, \`society_id\`, \`flat_id\`, \`created_at\`)
VALUES (${sql(adminId)}, ${sql(adminName)}, ${sql(adminEmail)}, NULL, ${sql(passwordHash)}, 'SOCIETY_ADMIN', 1, ${sql(societyId)}, NULL, NOW());
`;

  const file = path.join(process.env.INIT_CWD || process.cwd(), "admin-setup.sql");
  writeFileSync(file, statements, "utf8");

  console.log(`\nDone. Created: ${file}`);
  console.log("Next: in phpMyAdmin select your database, open the Import tab, choose that file, click Go.");
  console.log(`Then log in with ${adminEmail} and the password you just typed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
