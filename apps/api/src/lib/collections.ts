/**
 * Drizzle's relational query builder (`db.query.x.findMany({ with: {...} })`)
 * generates correlated JSON_ARRAYAGG subqueries that MySQL 8 accepts but
 * MariaDB's parser rejects outright — and MariaDB is what most shared hosts
 * (including Namecheap/cPanel) actually run under the "MySQL" label. Every
 * route in this API fetches related rows with plain `db.select()` calls and
 * stitches them together in JS using these two helpers instead, which works
 * identically on MySQL and MariaDB.
 */

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(key(row), row);
  return map;
}
