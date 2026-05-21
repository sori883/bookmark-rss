import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { article, category, feed } from "@acme/db/schema";

import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { buildTestApp } from "./helpers/app";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
  await db.insert(feed).values([
    {
      id: "feed-a",
      userId: user.id,
      url: "https://a.example.com/rss",
      title: "Feed A",
    },
    {
      id: "feed-b",
      userId: user.id,
      url: "https://b.example.com/rss",
      title: "Feed B",
    },
  ]);
  await db.insert(article).values([
    {
      id: "a1",
      userId: user.id,
      feedId: "feed-a",
      url: "https://a.example.com/1",
      title: "A1",
      isRead: false,
      publishedAt: new Date("2026-05-01T00:00:00Z"),
    },
    {
      id: "a2",
      userId: user.id,
      feedId: "feed-a",
      url: "https://a.example.com/2",
      title: "A2",
      isRead: true,
      publishedAt: new Date("2026-05-02T00:00:00Z"),
    },
    {
      id: "b1",
      userId: user.id,
      feedId: "feed-b",
      url: "https://b.example.com/1",
      title: "B1",
      isRead: false,
      publishedAt: new Date("2026-05-03T00:00:00Z"),
    },
  ]);
});

describe("GET /articles", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/articles");
    expect(res.status).toBe(401);
  });

  it("returns all articles of the current user (newest first)", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).toEqual(["b1", "a2", "a1"]);
  });

  it("filters by feedId", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?feedId=feed-a");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).toEqual(["a2", "a1"]);
  });

  it("filters unread only", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?unread=true");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).toEqual(["b1", "a1"]);
  });

  it("does not leak other users' articles", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(feed).values({
      id: "feed-c",
      userId: other.id,
      url: "https://c.example.com/rss",
      title: "Feed C",
    });
    await db.insert(article).values({
      id: "c1",
      userId: other.id,
      feedId: "feed-c",
      url: "https://c.example.com/1",
      title: "C1",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).not.toContain("c1");
  });
});

describe("GET /articles?categoryId=", () => {
  beforeEach(async () => {
    await db.insert(category).values({
      id: "cat-1",
      userId: user.id,
      name: "Tech",
    });
    await db
      .update(feed)
      .set({ categoryId: "cat-1" })
      .where(eq(feed.id, "feed-a"));
  });

  it("returns only articles whose feed belongs to the category", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=cat-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("returns only articles from uncategorized feeds when categoryId=none", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=none");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).toEqual(["b1"]);
  });

  it("combines categoryId with unread filter", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=cat-1&unread=true");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns empty when no feeds match the category", async () => {
    await db
      .insert(category)
      .values({ id: "cat-empty", userId: user.id, name: "Empty" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=cat-empty");
    const body = (await res.json()) as { id: string }[];
    expect(body).toEqual([]);
  });
});

describe("PATCH /articles/:id", () => {
  it("marks article as read", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/a1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    expect(res.status).toBe(200);
    const row = await db
      .select()
      .from(article)
      .where(eq(article.id, "a1"))
      .get();
    expect(row?.isRead).toBe(true);
  });

  it("marks article as unread", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/a2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isRead: false }),
    });
    expect(res.status).toBe(200);
    const row = await db
      .select()
      .from(article)
      .where(eq(article.id, "a2"))
      .get();
    expect(row?.isRead).toBe(false);
  });

  it("returns 400 for invalid body", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/a1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(feed).values({
      id: "feed-c",
      userId: other.id,
      url: "https://c.example.com/rss",
      title: "Feed C",
    });
    await db.insert(article).values({
      id: "c1",
      userId: other.id,
      feedId: "feed-c",
      url: "https://c.example.com/1",
      title: "C1",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    expect(res.status).toBe(404);
  });
});
