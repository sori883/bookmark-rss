import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import type { DbType } from "@acme/db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../../db/migrations");

export type TestDb = DbType;

export const createTestDb = async (): Promise<TestDb> => {
  const client = createClient({ url: ":memory:" });
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder });
  return db;
};
