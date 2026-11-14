import "dotenv/config";
import path from "path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

async function main() {
  const connectionUri = process.env.DATABASE_URL || "mysql://root:@127.0.0.1:3306/mycommunity";
  const connection = await mysql.createConnection(connectionUri);
  const db = drizzle(connection);

  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  console.log("Migrations applied.");
  await connection.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
