import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { article, feed } from "@acme/db/schema";

import type { ArticleFetcher, FetchedArticle } from "../src/article-fetcher";
import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { runFeedFetchJob } from "../src/run-feed-fetch";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

let db: TestDb;
let user1: TestUser;
let user2: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user1 = await createTestUser(db);
  user2 = await createTestUser(db, { email: "u2@example.com" });
});

const mkFetcher = (
  byUrl: Record<string, FetchedArticle[] | Error>,
): ArticleFetcher => ({
  fetchArticles: (feedUrl: string) => {
    const v = byUrl[feedUrl];
    if (v instanceof Error) return Promise.reject(v);
    if (!v) return Promise.reject(new Error(`unknown feed: ${feedUrl}`));
    return Promise.resolve(v);
  },
});

const fetchedArticle = (
  url: string,
  title: string,
  publishedAt: Date | null = null,
): FetchedArticle => ({
  url,
  title,
  description: null,
  ogImageUrl: null,
  publishedAt,
});

describe("runFeedFetchJob", () => {
  it("inserts articles for each feed", async () => {
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user1.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: user1.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const fetcher = mkFetcher({
      "https://a.example.com/rss": [
        fetchedArticle("https://a.example.com/1", "A1"),
        fetchedArticle("https://a.example.com/2", "A2"),
      ],
      "https://b.example.com/rss": [
        fetchedArticle("https://b.example.com/1", "B1"),
      ],
    });

    const result = await runFeedFetchJob({ db, articleFetcher: fetcher });

    expect(result).toEqual({
      feedsProcessed: 2,
      feedsFailed: 0,
      articlesInserted: 3,
    });
    const rows = await db.select().from(article);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.userId === user1.id)).toBe(true);
  });

  it("skips already-existing articles (URL dedup per feed)", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user1.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    await db.insert(article).values({
      id: "existing",
      userId: user1.id,
      feedId: "f1",
      url: "https://a.example.com/1",
      title: "Existing",
    });
    const fetcher = mkFetcher({
      "https://a.example.com/rss": [
        fetchedArticle("https://a.example.com/1", "Dup"),
        fetchedArticle("https://a.example.com/2", "New"),
      ],
    });

    const result = await runFeedFetchJob({ db, articleFetcher: fetcher });

    expect(result.articlesInserted).toBe(1);
    const rows = await db
      .select()
      .from(article)
      .where(eq(article.feedId, "f1"));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.url === "https://a.example.com/1")?.title).toBe(
      "Existing",
    );
  });

  it("dedupes duplicate URLs within the same fetched batch", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user1.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    const fetcher = mkFetcher({
      "https://a.example.com/rss": [
        fetchedArticle("https://a.example.com/1", "First"),
        fetchedArticle("https://a.example.com/1", "Duplicate"),
        fetchedArticle("https://a.example.com/2", "Second"),
      ],
    });

    const result = await runFeedFetchJob({ db, articleFetcher: fetcher });

    expect(result.articlesInserted).toBe(2);
    const rows = await db
      .select()
      .from(article)
      .where(eq(article.feedId, "f1"));
    expect(rows).toHaveLength(2);
  });

  it("updates lastFetchedAt on success", async () => {
    await db.insert(feed).values({
      id: "f1",
      userId: user1.id,
      url: "https://a.example.com/rss",
      title: "A",
    });
    const before = new Date();
    const fetcher = mkFetcher({
      "https://a.example.com/rss": [
        fetchedArticle("https://a.example.com/1", "A1"),
      ],
    });

    await runFeedFetchJob({ db, articleFetcher: fetcher });

    const row = await db.select().from(feed).where(eq(feed.id, "f1")).get();
    const lastFetched = row?.lastFetchedAt;
    expect(lastFetched).not.toBeNull();
    expect(lastFetched?.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("continues to next feed when one fails", async () => {
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user1.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: user1.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const fetcher = mkFetcher({
      "https://a.example.com/rss": new Error("network error"),
      "https://b.example.com/rss": [
        fetchedArticle("https://b.example.com/1", "B1"),
      ],
    });

    const result = await runFeedFetchJob({ db, articleFetcher: fetcher });

    expect(result).toEqual({
      feedsProcessed: 2,
      feedsFailed: 1,
      articlesInserted: 1,
    });
    const rowF1 = await db.select().from(feed).where(eq(feed.id, "f1")).get();
    expect(rowF1?.lastFetchedAt).toBeNull();
    const rowF2 = await db.select().from(feed).where(eq(feed.id, "f2")).get();
    expect(rowF2?.lastFetchedAt).not.toBeNull();
  });

  it("processes feeds across multiple users", async () => {
    await db.insert(feed).values([
      {
        id: "f1",
        userId: user1.id,
        url: "https://a.example.com/rss",
        title: "A",
      },
      {
        id: "f2",
        userId: user2.id,
        url: "https://b.example.com/rss",
        title: "B",
      },
    ]);
    const fetcher = mkFetcher({
      "https://a.example.com/rss": [
        fetchedArticle("https://a.example.com/1", "A1"),
      ],
      "https://b.example.com/rss": [
        fetchedArticle("https://b.example.com/1", "B1"),
      ],
    });

    await runFeedFetchJob({ db, articleFetcher: fetcher });

    const u1Articles = await db
      .select()
      .from(article)
      .where(eq(article.userId, user1.id));
    expect(u1Articles).toHaveLength(1);
    const u2Articles = await db
      .select()
      .from(article)
      .where(eq(article.userId, user2.id));
    expect(u2Articles).toHaveLength(1);
  });

  it("returns zero counts when there are no feeds", async () => {
    const fetcher = mkFetcher({});
    const result = await runFeedFetchJob({ db, articleFetcher: fetcher });
    expect(result).toEqual({
      feedsProcessed: 0,
      feedsFailed: 0,
      articlesInserted: 0,
    });
  });
});
