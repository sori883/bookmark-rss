import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { article, bookmark, bookmarkTag, feed, tag } from "@acme/db/schema";

import type { OgFetcher, OgMetadata } from "../src/env";
import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { buildTestApp } from "./helpers/app";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

const mkOg = (meta: Partial<OgMetadata> = {}): OgFetcher => ({
  fetch: (url: string) =>
    Promise.resolve({
      title: meta.title ?? "stub-title",
      description: meta.description ?? null,
      imageUrl: meta.imageUrl ?? null,
      ...(meta.title === undefined ? { title: `Stub ${url}` } : {}),
    }),
});

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

describe("GET /bookmarks", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/bookmarks");
    expect(res.status).toBe(401);
  });

  it("returns only the current user's bookmarks", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(bookmark).values([
      {
        id: "b1",
        userId: user.id,
        url: "https://example.com/1",
        title: "One",
      },
      {
        id: "b2",
        userId: other.id,
        url: "https://example.com/2",
        title: "Two",
      },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("GET /bookmarks/:id", () => {
  it("returns the bookmark", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
      contentMarkdown: "# One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      contentMarkdown: string | null;
    };
    expect(body).toMatchObject({ id: "b1", contentMarkdown: "# One" });
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: other.id,
      url: "https://example.com/1",
      title: "One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1");
    expect(res.status).toBe(404);
  });
});

describe("POST /bookmarks", () => {
  it("creates a bookmark using OG metadata fetched server-side", async () => {
    const app = buildTestApp({
      db,
      user,
      ogFetcher: mkOg({
        title: "Page A",
        description: "Description of A",
        imageUrl: "https://cdn.example.com/a.png",
      }),
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/a",
        contentMarkdown: "# A",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const row = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.id, body.id))
      .get();
    expect(row).toMatchObject({
      userId: user.id,
      url: "https://example.com/a",
      title: "Page A",
      description: "Description of A",
      ogImageUrl: "https://cdn.example.com/a.png",
      contentMarkdown: "# A",
    });
  });

  it("creates a bookmark linked to an article", async () => {
    await db.insert(feed).values({
      id: "feed-a",
      userId: user.id,
      url: "https://a.example.com/rss",
      title: "Feed A",
    });
    await db.insert(article).values({
      id: "a1",
      userId: user.id,
      feedId: "feed-a",
      url: "https://a.example.com/1",
      title: "A1",
    });
    const app = buildTestApp({
      db,
      user,
      ogFetcher: mkOg({ title: "A1 page" }),
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://a.example.com/1",
        articleId: "a1",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; articleId: string | null };
    expect(body.articleId).toBe("a1");
  });

  it("returns 400 for invalid url", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when articleId is not owned", async () => {
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
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://c.example.com/1",
        articleId: "c1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when the URL is already bookmarked", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/a",
      title: "Existing",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/a" }),
    });
    expect(res.status).toBe(409);
  });

  it("triggers readability extraction after creation", async () => {
    const app = buildTestApp({
      db,
      user,
      bookmarkContentFetcher: {
        fetch: () =>
          Promise.resolve({ title: "P", markdown: "# Extracted\n\nbody" }),
      },
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/post" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const row = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.id, body.id))
      .get();
    expect(row?.contentMarkdown).toBe("# Extracted\n\nbody");
  });

  it("returns 201 even when readability extraction fails", async () => {
    const app = buildTestApp({
      db,
      user,
      bookmarkContentFetcher: {
        fetch: () => Promise.reject(new Error("readability fail")),
      },
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/post" }),
    });
    expect(res.status).toBe(201);
  });

  it("does not dispatch extraction when contentMarkdown is supplied", async () => {
    let called = false;
    const app = buildTestApp({
      db,
      user,
      jobsDispatcher: {
        triggerFeedIngest: () => Promise.resolve(),
        triggerBookmarkExtract: () => {
          called = true;
          return Promise.resolve();
        },
      },
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/post",
        contentMarkdown: "manual",
      }),
    });
    expect(res.status).toBe(201);
    expect(called).toBe(false);
  });

  it("returns 422 when OG fetch fails", async () => {
    const app = buildTestApp({
      db,
      user,
      ogFetcher: {
        fetch: () => Promise.reject(new Error("network error")),
      },
    });
    const res = await app.request("/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/unreachable" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /bookmarks/bulk-delete", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/bookmarks/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1"] }),
    });
    expect(res.status).toBe(401);
  });

  it("deletes the specified bookmarks and returns the count", async () => {
    await db.insert(bookmark).values([
      { id: "b1", userId: user.id, url: "https://example.com/1", title: "1" },
      { id: "b2", userId: user.id, url: "https://example.com/2", title: "2" },
      { id: "b3", userId: user.id, url: "https://example.com/3", title: "3" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1", "b3"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    const remaining = await db
      .select({ id: bookmark.id })
      .from(bookmark)
      .where(eq(bookmark.userId, user.id));
    expect(remaining.map((r) => r.id)).toEqual(["b2"]);
  });

  it("does not delete bookmarks owned by other users", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(bookmark).values([
      { id: "b1", userId: user.id, url: "https://example.com/1", title: "1" },
      { id: "b2", userId: other.id, url: "https://example.com/2", title: "2" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1", "b2"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    const ownerRows = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.userId, other.id));
    expect(ownerRows).toHaveLength(1);
  });

  it("returns deleted: 0 when ids do not match anything", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["nope"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0 });
  });

  it("returns 400 when ids is empty", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /bookmarks?q= (full-text search)", () => {
  beforeEach(async () => {
    const app = buildTestApp({
      db,
      user,
      ogFetcher: {
        fetch: (url) => {
          if (url.endsWith("/tokyo"))
            {return Promise.resolve({
              title: "東京タワー観光",
              description: "東京の名所",
              imageUrl: null,
            });}
          if (url.endsWith("/kyoto"))
            {return Promise.resolve({
              title: "京都の寺院",
              description: "古都の風景",
              imageUrl: null,
            });}
          return Promise.resolve({
            title: "React Tutorial",
            description: "TypeScript and hooks",
            imageUrl: null,
          });
        },
      },
    });
    for (const url of [
      "https://example.com/tokyo",
      "https://example.com/kyoto",
      "https://example.com/react",
    ]) {
      await app.request("/bookmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
    }
  });

  it("matches Japanese term against title", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request(
      `/bookmarks?q=${encodeURIComponent("東京")}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string }[];
    expect(body.map((b) => b.title)).toEqual(["東京タワー観光"]);
  });

  it("matches ASCII term case-insensitively", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks?q=react");
    const body = (await res.json()) as { title: string }[];
    expect(body.map((b) => b.title)).toEqual(["React Tutorial"]);
  });

  it("returns empty array for no matches", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request(
      `/bookmarks?q=${encodeURIComponent("沖縄")}`,
    );
    expect(await res.json()).toEqual([]);
  });

  it("returns empty array when query has no usable tokens", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request(
      `/bookmarks?q=${encodeURIComponent("、。")}`,
    );
    expect(await res.json()).toEqual([]);
  });

  it("combines q with tagId filter", async () => {
    const existing = await db
      .select({ id: bookmark.id, title: bookmark.title })
      .from(bookmark);
    const tokyo = existing.find((b) => b.title === "東京タワー観光");
    if (!tokyo) {
      throw new Error("setup: tokyo bookmark missing");
    }
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "trip" });
    await db
      .insert(bookmarkTag)
      .values({ bookmarkId: tokyo.id, tagId: "t1" });

    const app = buildTestApp({ db, user });
    const res = await app.request(
      `/bookmarks?q=${encodeURIComponent("の")}&tagId=t1`,
    );
    const body = (await res.json()) as { title: string }[];
    expect(body.map((b) => b.title)).toEqual(["東京タワー観光"]);
  });

  it("does not leak other users' bookmarks", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    const app = buildTestApp({ db, user: other });
    const res = await app.request(
      `/bookmarks?q=${encodeURIComponent("東京")}`,
    );
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /bookmarks with tags", () => {
  it("includes tags array on each bookmark", async () => {
    await db.insert(tag).values([
      { id: "t1", userId: user.id, name: "rust" },
      { id: "t2", userId: user.id, name: "ai" },
    ]);
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
    });
    await db.insert(bookmarkTag).values([
      { bookmarkId: "b1", tagId: "t1" },
      { bookmarkId: "b1", tagId: "t2" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks");
    const body = (await res.json()) as {
      id: string;
      tags: { id: string; name: string }[];
    }[];
    expect(body[0]?.tags.map((t) => t.name)).toEqual(["ai", "rust"]);
  });

  it("filters bookmarks by tagId", async () => {
    await db.insert(tag).values({
      id: "t1",
      userId: user.id,
      name: "rust",
    });
    await db.insert(bookmark).values([
      {
        id: "b1",
        userId: user.id,
        url: "https://example.com/1",
        title: "Tagged",
      },
      {
        id: "b2",
        userId: user.id,
        url: "https://example.com/2",
        title: "Untagged",
      },
    ]);
    await db.insert(bookmarkTag).values({ bookmarkId: "b1", tagId: "t1" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks?tagId=t1");
    const body = (await res.json()) as { id: string }[];
    expect(body.map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("PATCH /bookmarks/:id (tags)", () => {
  it("replaces tags on a bookmark", async () => {
    await db.insert(tag).values([
      { id: "t1", userId: user.id, name: "rust" },
      { id: "t2", userId: user.id, name: "ai" },
    ]);
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
    });
    await db.insert(bookmarkTag).values({ bookmarkId: "b1", tagId: "t1" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagIds: ["t2"] }),
    });
    expect(res.status).toBe(200);
    const links = await db
      .select()
      .from(bookmarkTag)
      .where(eq(bookmarkTag.bookmarkId, "b1"));
    expect(links.map((l) => l.tagId)).toEqual(["t2"]);
  });

  it("clears tags when tagIds is empty", async () => {
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "rust" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
    });
    await db.insert(bookmarkTag).values({ bookmarkId: "b1", tagId: "t1" });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagIds: [] }),
    });
    expect(res.status).toBe(200);
    const links = await db
      .select()
      .from(bookmarkTag)
      .where(eq(bookmarkTag.bookmarkId, "b1"));
    expect(links).toHaveLength(0);
  });

  it("returns 400 when a tag is not owned by the user", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values({ id: "t1", userId: other.id, name: "x" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagIds: ["t1"] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when bookmark not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: other.id,
      url: "https://example.com/1",
      title: "One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagIds: [] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /bookmarks/bulk-add-tags", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/bookmarks/bulk-add-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1"], tagIds: ["t1"] }),
    });
    expect(res.status).toBe(401);
  });

  it("adds tags to multiple bookmarks additively", async () => {
    await db.insert(tag).values([
      { id: "t1", userId: user.id, name: "rust" },
      { id: "t2", userId: user.id, name: "ai" },
    ]);
    await db.insert(bookmark).values([
      { id: "b1", userId: user.id, url: "https://example.com/1", title: "1" },
      { id: "b2", userId: user.id, url: "https://example.com/2", title: "2" },
    ]);
    await db.insert(bookmarkTag).values({ bookmarkId: "b1", tagId: "t1" });

    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-add-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1", "b2"], tagIds: ["t1", "t2"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; added: number };
    expect(body.updated).toBe(2);
    expect(body.added).toBe(3);

    const allLinks = await db.select().from(bookmarkTag);
    const pairs = new Set(allLinks.map((l) => `${l.bookmarkId}::${l.tagId}`));
    expect(pairs).toEqual(
      new Set(["b1::t1", "b1::t2", "b2::t1", "b2::t2"]),
    );
  });

  it("skips bookmarks not owned by the user", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values({ id: "t1", userId: user.id, name: "rust" });
    await db.insert(bookmark).values([
      { id: "b1", userId: user.id, url: "https://example.com/1", title: "1" },
      { id: "b2", userId: other.id, url: "https://example.com/2", title: "2" },
    ]);
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-add-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1", "b2"], tagIds: ["t1"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number; added: number };
    expect(body.updated).toBe(1);
    expect(body.added).toBe(1);
  });

  it("returns 400 when a tag is not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(tag).values({ id: "t1", userId: other.id, name: "x" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "1",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/bulk-add-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b1"], tagIds: ["t1"] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /bookmarks/:id", () => {
  it("deletes the bookmark", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/a",
      title: "One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", { method: "DELETE" });
    expect(res.status).toBe(204);
    const rows = await db.select().from(bookmark).where(eq(bookmark.id, "b1"));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 when not owned", async () => {
    const other = await createTestUser(db, { email: "x@example.com" });
    await db.insert(bookmark).values({
      id: "b1",
      userId: other.id,
      url: "https://example.com/a",
      title: "One",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/bookmarks/b1", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
