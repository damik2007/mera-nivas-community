import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, type SQL } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { createId } from "@paralleldrive/cuid2";
import * as schemaDefs from "./schema";

// DATABASE_URL is a standard MySQL connection string, e.g.:
//   mysql://user:password@127.0.0.1:3306/mycommunity
// On most shared hosts (including cPanel/Namecheap) the DB host is "localhost"
// and the database/user names are prefixed with your cPanel username.
const connectionUri = process.env.DATABASE_URL || "mysql://root:@127.0.0.1:3306/mycommunity";

// Detect cloud (non-local) hosts and enable TLS automatically.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionUri);

const pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_POOL_SIZE) || 5,
  ...(isLocal ? {} : {
    ssl: {
      minVersion: "TLSv1.2" as const,
      rejectUnauthorized: true,
    },
  }),
});

export const db = drizzle(pool, { schema: schemaDefs, mode: "default" });
export * from "./schema";
export * as schema from "./schema";
export { pool };

// Re-export drizzle-orm's query operators (eq, and, or, desc, sql, ...) from this
// package so every consumer shares a single drizzle-orm instance — mixing two
// installed copies (e.g. one from apps/api, one from here) breaks TypeScript's
// structural typing for query builders even though the runtime code is identical.
export * from "drizzle-orm";

// ---- MySQL has no RETURNING clause, so these helpers generate the row's id
// up front (our ids are app-generated cuid2 strings, not auto-increment) and
// re-select the affected row(s) after the write. Every route imports these
// instead of chaining `.returning()`. ----

export async function insertReturning<T extends Record<string, any>>(
  table: MySqlTable & { id: any },
  values: T
): Promise<[any]> {
  const id = (values as any).id ?? createId();
  await db.insert(table).values({ ...values, id } as any);
  const [row] = await db.select().from(table as any).where(eq((table as any).id, id));
  return [row];
}

export async function updateReturning<T extends Record<string, any>>(
  table: MySqlTable,
  values: T,
  where: SQL
): Promise<any[]> {
  await db.update(table).set(values as any).where(where);
  return db.select().from(table as any).where(where);
}
