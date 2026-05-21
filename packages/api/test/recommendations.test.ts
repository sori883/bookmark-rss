import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  article,
  feed,
  recommendation,
  recommendationItem,
} from "@acme/db/schema";

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

const seedRecommendation = async (
  date: string,
  items: { source: "ai" | "random"; reason: string | null; idx: number }[],
) => {
  await db.insert(feed).values({
    id: "f1",
    userId: user.id,
    url: "https://example.com/feed",
    title: "Feed",
  });
  const recId = `rec-${date}`;
  await db.insert(recommendation).values({
    id: recId,
    userId: user.id,
    date,
    generatedAt: new Date("2026-05-22T08:00:00Z"),
  });
  for (const it of items) {
    const articleId = `a-${it.idx}`;
    await db.insert(article).values({
      id: articleId,
      userId: user.id,
      feedId: "f1",
      url: `https://example.com/${articleId}`,
      title: `Title ${it.idx}`,
      description: `Desc ${it.idx}`,
      ogImageUrl: `https://example.com/og-${it.idx}.png`,
      publishedAt: new Date(
        `2026-05-21T${String(it.idx).padStart(2, "0")}:00:00Z`,
      ),
    });
    await db.insert(recommendationItem).values({
      id: `ri-${articleId}`,
      recommendationId: recId,
      articleId,
      source: it.source,
      rank: it.idx,
      reason: it.reason,
    });
  }
};

interface RecommendationResponse {
  date: string;
  items: {
    articleId: string;
    source: "ai" | "random";
    rank: number;
    reason: string | null;
    article: {
      id: string;
      title: string;
      url: string;
      description: string | null;
      ogImageUrl: string | null;
    };
  }[];
}

describe("GET /recommendations/today", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/recommendations/today");
    expect(res.status).toBe(401);
  });

  it("returns 404 when no recommendation exists for today (JST)", async () => {
    // Today in JST. The route should compute it; test uses today.
    const app = buildTestApp({ db, user });
    const res = await app.request("/recommendations/today");
    expect(res.status).toBe(404);
  });

  it("returns today's recommendation with items joined to articles", async () => {
    const now = new Date("2026-05-21T23:30:00Z"); // 2026-05-22 08:30 JST
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await seedRecommendation("2026-05-22", [
        { source: "ai", reason: "面白い", idx: 0 },
        { source: "ai", reason: "おすすめ", idx: 1 },
        { source: "random", reason: null, idx: 2 },
      ]);

      const app = buildTestApp({ db, user });
      const res = await app.request("/recommendations/today");

      expect(res.status).toBe(200);
      const body = (await res.json()) as RecommendationResponse;
      expect(body.date).toBe("2026-05-22");
      expect(body.items).toHaveLength(3);
      expect(body.items[0]).toMatchObject({
        articleId: "a-0",
        source: "ai",
        rank: 0,
        reason: "面白い",
        article: {
          id: "a-0",
          title: "Title 0",
          url: "https://example.com/a-0",
          ogImageUrl: "https://example.com/og-0.png",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("orders items by rank ascending", async () => {
    const now = new Date("2026-05-21T23:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await seedRecommendation("2026-05-22", [
        { source: "ai", reason: null, idx: 2 },
        { source: "ai", reason: null, idx: 0 },
        { source: "ai", reason: null, idx: 1 },
      ]);
      const app = buildTestApp({ db, user });
      const res = await app.request("/recommendations/today");
      const body = (await res.json()) as RecommendationResponse;
      expect(body.items.map((i) => i.rank)).toEqual([0, 1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not leak another user's recommendation", async () => {
    const other = await createTestUser(db, { email: "other@example.com" });
    await db.insert(feed).values({
      id: "f-other",
      userId: other.id,
      url: "https://other.example.com/feed",
      title: "Other",
    });
    await db.insert(recommendation).values({
      id: "rec-other",
      userId: other.id,
      date: "2026-05-22",
    });
    const now = new Date("2026-05-21T23:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const app = buildTestApp({ db, user });
      const res = await app.request("/recommendations/today");
      expect(res.status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /recommendations/:date", () => {
  it("returns the recommendation for that specific date", async () => {
    await seedRecommendation("2026-05-20", [
      { source: "ai", reason: "good", idx: 0 },
    ]);

    const app = buildTestApp({ db, user });
    const res = await app.request("/recommendations/2026-05-20");
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecommendationResponse;
    expect(body.date).toBe("2026-05-20");
  });

  it("returns 400 for malformed date strings", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/recommendations/not-a-date");
    expect(res.status).toBe(400);
  });

  it("returns 404 when no recommendation exists for the date", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/recommendations/2026-01-01");
    expect(res.status).toBe(404);
  });
});
