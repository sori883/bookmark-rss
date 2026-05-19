import { randomUUID } from "node:crypto";

import { user } from "@acme/db/schema";

import type { TestDb } from "./db";

export interface TestUser {
  id: string;
}

export const createTestUser = async (
  db: TestDb,
  overrides: { email?: string } = {},
): Promise<TestUser> => {
  const now = new Date();
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: "Test User",
    email: overrides.email ?? `test-${id}@example.com`,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
};
