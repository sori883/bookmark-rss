import { randomUUID } from "node:crypto";

import { user } from "@acme/db/schema";

import type { TestDb } from "./db";

export interface TestUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export const createTestUser = async (
  db: TestDb,
  overrides: Partial<TestUser> = {},
): Promise<TestUser> => {
  const now = new Date();
  const row: TestUser = {
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? "Test User",
    email: overrides.email ?? `test-${randomUUID()}@example.com`,
    emailVerified: overrides.emailVerified ?? true,
    image: overrides.image ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  await db.insert(user).values(row);
  return row;
};
