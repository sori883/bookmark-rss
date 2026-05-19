import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { article, category, feed } from "@acme/db/schema";
import type { ArticleFetcher } from "@acme/jobs";

import type { FeedFetcher } from "../src/env";
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
});

describe("GET /feeds", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/feeds");
    expect(res.status).toBe(401);
  });

  it("returns empty array initially", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns only the current user's feeds", async () => {
    const other = await createTestUser(db, { email: "other@example.com" });
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: other.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds");
    const body = (await res.json()) as { id: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe("f1");
  });
});

describe("GET /feeds/:id", () => {
  it("returns 404 for a non-existent feed", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/missing");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a feed owned by another user", async () => {
    const other = await createTestUser(db, { email: "other@example.com" });
    await db.insert(feed).values({
      id: "f1",
      userId: other.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1");
    expect(res.status).toBe(404);
  });

  it("returns the feed", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "f1", title: "A" });
  });
});

describe("POST /feeds", () => {
  const mkFetcher = (meta: {
    title: string;
    siteUrl: string | null;
    feedUrl?: string;
  }) =>
    ({
      fetchMetadata: (url: string) =>
        Promise.resolve({ ...meta, feedUrl: meta.feedUrl ?? url }),
    }) satisfies FeedFetcher;

  it("creates a feed with metadata from fetcher", async () => {
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({
        title: "Example Feed",
        siteUrl: "https://example.com",
      }),
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/rss" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      url: string;
      title: string;
      siteUrl: string | null;
    };
    expect(body).toMatchObject({
      url: "https://example.com/rss",
      title: "Example Feed",
      siteUrl: "https://example.com",
    });
    const rows = await db.select().from(feed).where(eq(feed.id, body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user.id);
  });

  it("stores the resolved feedUrl when discovery picks a different URL", async () => {
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({
        title: "Example Feed",
        siteUrl: "https://example.com",
        feedUrl: "https://example.com/feed.xml",
      }),
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://example.com/feed.xml");
  });

  it("returns 422 when discovery fails", async () => {
    const app = buildTestApp({
      db,
      user,
      feedFetcher: {
        fetchMetadata: () =>
          Promise.reject(new Error("Could not discover a feed")),
      },
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/no-feed" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid URL", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when the feed URL is already registered for the user", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({ title: "Example", siteUrl: null }),
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/rss" }),
    });
    expect(res.status).toBe(409);
  });

  it("kicks off article ingestion after creating the feed", async () => {
    const articleFetcher: ArticleFetcher = {
      fetchArticles: () =>
        Promise.resolve([
          {
            url: "https://example.com/post-1",
            title: "Post 1",
            description: "First",
            ogImageUrl: null,
            publishedAt: null,
          },
          {
            url: "https://example.com/post-2",
            title: "Post 2",
            description: null,
            ogImageUrl: "https://cdn.example.com/2.png",
            publishedAt: new Date("2026-05-19T00:00:00Z"),
          },
        ]),
    };
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({
        title: "Example",
        siteUrl: null,
        feedUrl: "https://example.com/rss",
      }),
      articleFetcher,
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/rss" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };

    const articles = await db
      .select()
      .from(article)
      .where(eq(article.feedId, body.id));
    expect(articles).toHaveLength(2);
    expect(articles.map((a) => a.url).sort()).toEqual([
      "https://example.com/post-1",
      "https://example.com/post-2",
    ]);
  });

  it("still returns 201 even when article ingestion fails", async () => {
    const articleFetcher: ArticleFetcher = {
      fetchArticles: () => Promise.reject(new Error("fetch failed")),
    };
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({
        title: "Example",
        siteUrl: null,
        feedUrl: "https://example.com/rss",
      }),
      articleFetcher,
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/rss" }),
    });
    expect(res.status).toBe(201);
    const feeds = await db.select().from(feed).where(eq(feed.userId, user.id));
    expect(feeds).toHaveLength(1);
  });

  it("returns 409 when discovery resolves to an already-registered feed", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/feed.xml",
      title: "Existing",
    });
    const app = buildTestApp({
      db,
      user,
      feedFetcher: mkFetcher({
        title: "Example",
        siteUrl: "https://example.com",
        feedUrl: "https://example.com/feed.xml",
      }),
    });
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /feeds/import", () => {
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed" htmlUrl="https://a.example.com"/>
    <outline type="rss" text="B" xmlUrl="https://b.example.com/feed"/>
  </body>
</opml>`;

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/feeds/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opml }),
    });
    expect(res.status).toBe(401);
  });

  it("imports all entries from OPML", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opml }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 2, skipped: 0, total: 2 });
    const rows = await db.select().from(feed).where(eq(feed.userId, user.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.url).sort()).toEqual([
      "https://a.example.com/feed",
      "https://b.example.com/feed",
    ]);
  });

  it("skips entries already registered for the user", async () => {
    await db.insert(feed).values({
      id: "existing",
      userId: user.id,
      url: "https://a.example.com/feed",
      title: "Existing A",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opml }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, skipped: 1, total: 2 });
    const rows = await db.select().from(feed).where(eq(feed.userId, user.id));
    expect(rows).toHaveLength(2);
  });

  it("deduplicates entries within the same OPML payload", async () => {
    const dupOpml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed"/>
    <outline type="rss" text="A dup" xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opml: dupOpml }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, skipped: 1, total: 2 });
  });

  it("returns 400 for malformed OPML", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opml: "not opml" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /feeds/bulk-delete", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/feeds/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1"] }),
    });
    expect(res.status).toBe(401);
  });

  it("deletes the specified feeds and returns the count", async () => {
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: user.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
      {
        id: "f3",
        userId: user.id,
        url: "https://c.example.com/rss",
        title: "C",
      },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1", "f3"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    const remaining = await db
      .select({ id: feed.id })
      .from(feed)
      .where(eq(feed.userId, user.id));
    expect(remaining.map((r) => r.id)).toEqual(["f2"]);
  });

  it("does not delete feeds owned by other users", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: other.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1", "f2"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    const ownerRows = await db
      .select()
      .from(feed)
      .where(eq(feed.userId, other.id));
    expect(ownerRows).toHaveLength(1);
  });

  it("returns deleted: 0 when ids do not match anything", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["nonexistent"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0 });
  });

  it("returns 400 when ids is empty", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /feeds/:id (category assignment)", () => {
  it("assigns a category to a feed", async () => {
    await db.insert(category).values({
      id: "c1",
      userId: user.id,
      name: "Tech",
    });
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: "c1" }),
    });
    expect(res.status).toBe(200);
    const row = await db.select().from(feed).where(eq(feed.id, "f1")).get();
    expect(row?.categoryId).toBe("c1");
  });

  it("unassigns by passing categoryId: null", async () => {
    await db.insert(category).values({
      id: "c1",
      userId: user.id,
      name: "Tech",
    });
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      categoryId: "c1",
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: null }),
    });
    expect(res.status).toBe(200);
    const row = await db.select().from(feed).where(eq(feed.id, "f1")).get();
    expect(row?.categoryId).toBeNull();
  });

  it("returns 400 when assigning a category owned by another user", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(category).values({
      id: "c1",
      userId: other.id,
      name: "X",
    });
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: "c1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the feed is not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(feed).values({
      id: "f1",
      userId: other.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: null }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /feeds/bulk-update-category", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1"], categoryId: null }),
    });
    expect(res.status).toBe(401);
  });

  it("assigns a category to multiple feeds", async () => {
    await db.insert(category).values({
      id: "c1",
      userId: user.id,
      name: "Tech",
    });
    await db.insert(feed).values([
      { id: "f1", userId: user.id, url: "https://a.example.com/rss", title: "A" },
      { id: "f2", userId: user.id, url: "https://b.example.com/rss", title: "B" },
      { id: "f3", userId: user.id, url: "https://c.example.com/rss", title: "C" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1", "f2"], categoryId: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    const rows = await db.select().from(feed).where(eq(feed.userId, user.id));
    const map = Object.fromEntries(rows.map((r) => [r.id, r.categoryId]));
    expect(map).toEqual({ f1: "c1", f2: "c1", f3: null });
  });

  it("unassigns category when categoryId is null", async () => {
    await db.insert(category).values({
      id: "c1",
      userId: user.id,
      name: "Tech",
    });
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user.id,
        categoryId: "c1",
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: user.id,
        categoryId: "c1",
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1", "f2"], categoryId: null }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    const rows = await db.select().from(feed).where(eq(feed.userId, user.id));
    expect(rows.every((r) => r.categoryId === null)).toBe(true);
  });

  it("does not update feeds owned by other users", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(category).values({
      id: "c1",
      userId: user.id,
      name: "Tech",
    });
    await db.insert(feed).values([
      { id: "f1", userId: user.id, url: "https://a.example.com/rss", title: "A" },
      { id: "f2", userId: other.id, url: "https://b.example.com/rss", title: "B" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1", "f2"], categoryId: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 1 });
    const otherRow = await db
      .select()
      .from(feed)
      .where(eq(feed.id, "f2"))
      .get();
    expect(otherRow?.categoryId).toBeNull();
  });

  it("returns 400 when categoryId is not owned by the user", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(category).values({
      id: "c1",
      userId: other.id,
      name: "X",
    });
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1"], categoryId: "c1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is empty", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/bulk-update-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [], categoryId: null }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /feeds/:id", () => {
  it("deletes the feed", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", { method: "DELETE" });
    expect(res.status).toBe(204);
    const rows = await db.select().from(feed).where(eq(feed.id, "f1"));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "other@example.com" });
    await db.insert(feed).values({
      id: "f1",
      userId: other.id,
      url: "https://example.com/rss",
      title: "Example",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/feeds/f1", { method: "DELETE" });
    expect(res.status).toBe(404);
    const rows = await db.select().from(feed).where(eq(feed.id, "f1"));
    expect(rows).toHaveLength(1);
  });
});
