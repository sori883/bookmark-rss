import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { category, feed } from "@acme/db/schema";

import { buildTestApp } from "./helpers/app";
import { createTestDb } from "./helpers/db";
import type { TestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";
import type { TestUser } from "./helpers/seed";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

describe("GET /categories", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/categories");
    expect(res.status).toBe(401);
  });

  it("returns the user's categories sorted by name", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(category).values([
      { id: "c1", userId: user.id, name: "Zeta" },
      { id: "c2", userId: user.id, name: "Alpha" },
      { id: "c3", userId: other.id, name: "Other" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string }[];
    expect(body.map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("POST /categories", () => {
  it("creates a category", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Tech" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("Tech");
    const rows = await db
      .select()
      .from(category)
      .where(eq(category.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("returns 400 for empty name", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate name within the same user", async () => {
    await db
      .insert(category)
      .values({ id: "c1", userId: user.id, name: "Tech" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Tech" }),
    });
    expect(res.status).toBe(409);
  });

  it("allows the same name for different users", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db
      .insert(category)
      .values({ id: "c1", userId: other.id, name: "Tech" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Tech" }),
    });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /categories/:id", () => {
  it("renames a category", async () => {
    await db
      .insert(category)
      .values({ id: "c1", userId: user.id, name: "Old" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    const row = await db
      .select()
      .from(category)
      .where(eq(category.id, "c1"))
      .get();
    expect(row?.name).toBe("New");
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db
      .insert(category)
      .values({ id: "c1", userId: other.id, name: "X" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Y" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the new name collides with another category", async () => {
    await db.insert(category).values([
      { id: "c1", userId: user.id, name: "Tech" },
      { id: "c2", userId: user.id, name: "News" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories/c2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Tech" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /categories/:id", () => {
  it("deletes and unassigns from feeds (ON DELETE SET NULL)", async () => {
    await db
      .insert(category)
      .values({ id: "c1", userId: user.id, name: "Tech" });
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      categoryId: "c1",
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories/c1", { method: "DELETE" });
    expect(res.status).toBe(204);
    const cats = await db.select().from(category);
    expect(cats).toHaveLength(0);
    const f = await db.select().from(feed).where(eq(feed.id, "f1")).get();
    expect(f?.categoryId).toBeNull();
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db
      .insert(category)
      .values({ id: "c1", userId: other.id, name: "X" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/categories/c1", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
