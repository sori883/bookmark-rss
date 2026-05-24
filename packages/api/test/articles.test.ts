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

interface ArticleListResponse {
  items: { id: string }[];
  total: number;
  page: number;
  perPage: number;
}

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
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).toEqual(["b1", "a2", "a1"]);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(50);
  });

  it("filters by feedId", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?feedId=feed-a");
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(body.total).toBe(2);
  });

  it("filters unread only", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?unread=true");
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).toEqual(["b1", "a1"]);
    expect(body.total).toBe(2);
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
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).not.toContain("c1");
  });

  it("paginates with page=2 and exposes total across pages", async () => {
    // Seed enough rows so we can request page=2. The 3 articles from
    // beforeEach are already in feed-a / feed-b; add 60 more on feed-a.
    const extras = Array.from({ length: 60 }, (_, i) => ({
      id: `extra-${String(i).padStart(2, "0")}`,
      userId: user.id,
      feedId: "feed-a",
      url: `https://a.example.com/x/${i}`,
      title: `Extra ${i}`,
      isRead: false,
      publishedAt: new Date(`2025-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    }));
    await db.insert(article).values(extras);

    const app = buildTestApp({ db, user });
    const page1 = (await (await app.request("/articles?page=1")).json()) as ArticleListResponse;
    const page2 = (await (await app.request("/articles?page=2")).json()) as ArticleListResponse;
    expect(page1.items).toHaveLength(50);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeLessThanOrEqual(50);
    expect(page1.total).toBe(page2.total);
    expect(page1.total).toBe(63);
    // No overlap between page 1 and page 2.
    const intersect = page1.items
      .map((a) => a.id)
      .filter((id) => page2.items.some((b) => b.id === id));
    expect(intersect).toEqual([]);
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
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(body.total).toBe(2);
  });

  it("returns only articles from uncategorized feeds when categoryId=none", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=none");
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).toEqual(["b1"]);
  });

  it("combines categoryId with unread filter", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=cat-1&unread=true");
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items.map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns empty items when no feeds match the category", async () => {
    await db
      .insert(category)
      .values({ id: "cat-empty", userId: user.id, name: "Empty" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles?categoryId=cat-empty");
    const body = (await res.json()) as ArticleListResponse;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
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

describe("POST /articles/bulk-mark-read", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedIds: ["feed-a"] }),
    });
    expect(res.status).toBe(401);
  });

  it("marks all unread articles of the selected feeds as read", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedIds: ["feed-a", "feed-b"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    // a1 (unread) + b1 (unread) のみ更新、 a2 (already read) は除外
    expect(body.updated).toBe(2);
    const rows = await db.select().from(article);
    expect(rows.every((r) => r.isRead === true)).toBe(true);
  });

  it("does not touch other users' articles", async () => {
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
      isRead: false,
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedIds: ["feed-c"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(0);
    const c1 = await db
      .select()
      .from(article)
      .where(eq(article.id, "c1"))
      .get();
    expect(c1?.isRead).toBe(false);
  });

  it("returns 400 when feedIds is empty", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("marks selected articleIds as read", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleIds: ["a1", "b1"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(2);
    const a1 = await db
      .select()
      .from(article)
      .where(eq(article.id, "a1"))
      .get();
    const b1 = await db
      .select()
      .from(article)
      .where(eq(article.id, "b1"))
      .get();
    expect(a1?.isRead).toBe(true);
    expect(b1?.isRead).toBe(true);
  });

  it("does not touch other users' articles when articleIds given", async () => {
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
      isRead: false,
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleIds: ["c1"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(0);
    const c1 = await db
      .select()
      .from(article)
      .where(eq(article.id, "c1"))
      .get();
    expect(c1?.isRead).toBe(false);
  });

  it("returns 400 when neither feedIds nor articleIds is given", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/articles/bulk-mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
