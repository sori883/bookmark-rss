import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { bookmark, bookmarkTag, tag } from "@acme/db/schema";

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

describe("GET /tags", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/tags");
    expect(res.status).toBe(401);
  });

  it("returns user's tags sorted by name", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values([
      { id: "t1", userId: user.id, name: "Zeta" },
      { id: "t2", userId: user.id, name: "Alpha" },
      { id: "t3", userId: other.id, name: "Other" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags");
    const body = (await res.json()) as { id: string; name: string }[];
    expect(body.map((t) => t.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("POST /tags", () => {
  it("creates a tag", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "rust" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("rust");
  });

  it("returns 409 for duplicate name within the same user", async () => {
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "rust" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "rust" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 for empty name", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /tags/:id", () => {
  it("renames a tag", async () => {
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "old" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "new" }),
    });
    expect(res.status).toBe(200);
    const row = await db.select().from(tag).where(eq(tag.id, "t1")).get();
    expect(row?.name).toBe("new");
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values({ id: "t1", userId: other.id, name: "x" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "y" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the new name collides", async () => {
    await db.insert(tag).values([
      { id: "t1", userId: user.id, name: "rust" },
      { id: "t2", userId: user.id, name: "go" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags/t2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "rust" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /tags/:id", () => {
  it("deletes the tag and its bookmark associations", async () => {
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "rust" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
    });
    await db.insert(bookmarkTag).values({ bookmarkId: "b1", tagId: "t1" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags/t1", { method: "DELETE" });
    expect(res.status).toBe(204);
    const tags = await db.select().from(tag);
    expect(tags).toHaveLength(0);
    const links = await db.select().from(bookmarkTag);
    expect(links).toHaveLength(0);
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values({ id: "t1", userId: other.id, name: "x" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/tags/t1", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
