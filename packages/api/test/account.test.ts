import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  article,
  bookmark,
  bookmarkTag,
  category,
  feed,
  recommendation,
  recommendationItem,
  session,
  tag,
  user,
  userPreference,
} from "@acme/db/schema";

import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { buildTestApp } from "./helpers/app";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

let db: TestDb;
let userA: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  userA = await createTestUser(db);
  await db.insert(category).values({
    id: "cat-1",
    userId: userA.id,
    name: "Tech",
  });
  await db.insert(feed).values({
    id: "feed-1",
    userId: userA.id,
    url: "https://example.com/rss",
    title: "Example",
    categoryId: "cat-1",
  });
  await db.insert(article).values({
    id: "art-1",
    userId: userA.id,
    feedId: "feed-1",
    url: "https://example.com/1",
    title: "A1",
  });
  await db.insert(tag).values({
    id: "tag-1",
    userId: userA.id,
    name: "favorite",
  });
  await db.insert(bookmark).values({
    id: "bm-1",
    userId: userA.id,
    url: "https://example.com/1",
    title: "B1",
  });
  await db.insert(bookmarkTag).values({
    bookmarkId: "bm-1",
    tagId: "tag-1",
  });
  await db.insert(userPreference).values({
    id: "pref-1",
    userId: userA.id,
    recommendationEnabled: true,
    recommendationHour: 8,
  });
  await db.insert(recommendation).values({
    id: "rec-1",
    userId: userA.id,
    date: "2026-05-23",
  });
  await db.insert(recommendationItem).values({
    id: "ri-1",
    recommendationId: "rec-1",
    articleId: "art-1",
    source: "ai",
    rank: 1,
  });
  await db.insert(session).values({
    id: "sess-1",
    userId: userA.id,
    token: "tok-1",
    expiresAt: new Date(Date.now() + 60_000),
  });
});

describe("DELETE /account", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/account", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("deletes the user and all owned data", async () => {
    const app = buildTestApp({ db, user: userA });
    const res = await app.request("/account", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(true);

    const remainingUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userA.id))
      .get();
    expect(remainingUser).toBeUndefined();

    const counts = await Promise.all([
      db.select().from(category).where(eq(category.userId, userA.id)),
      db.select().from(feed).where(eq(feed.userId, userA.id)),
      db.select().from(article).where(eq(article.userId, userA.id)),
      db.select().from(tag).where(eq(tag.userId, userA.id)),
      db.select().from(bookmark).where(eq(bookmark.userId, userA.id)),
      db.select().from(bookmarkTag).where(eq(bookmarkTag.bookmarkId, "bm-1")),
      db
        .select()
        .from(userPreference)
        .where(eq(userPreference.userId, userA.id)),
      db
        .select()
        .from(recommendation)
        .where(eq(recommendation.userId, userA.id)),
      db
        .select()
        .from(recommendationItem)
        .where(eq(recommendationItem.recommendationId, "rec-1")),
      db.select().from(session).where(eq(session.userId, userA.id)),
    ]);
    for (const rows of counts) {
      expect(rows).toEqual([]);
    }
  });

  it("does not affect other users' data", async () => {
    const userB = await createTestUser(db, { email: "b@example.com" });
    await db.insert(feed).values({
      id: "feed-b",
      userId: userB.id,
      url: "https://b.example.com/rss",
      title: "Feed B",
    });
    const app = buildTestApp({ db, user: userA });
    const res = await app.request("/account", { method: "DELETE" });
    expect(res.status).toBe(200);

    const remainingB = await db
      .select()
      .from(user)
      .where(eq(user.id, userB.id))
      .get();
    expect(remainingB?.id).toBe(userB.id);
    const feedsB = await db
      .select()
      .from(feed)
      .where(eq(feed.userId, userB.id));
    expect(feedsB.map((f) => f.id)).toEqual(["feed-b"]);
  });
});
