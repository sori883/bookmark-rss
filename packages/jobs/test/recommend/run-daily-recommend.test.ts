/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  article,
  feed,
  recommendation,
  recommendationItem,
  userPreference,
} from "@acme/db/schema";

import type { VertexGeminiClient } from "../../src/recommend/vertex-gemini";
import type { TestDb } from "../helpers/db";
import type { TestUser } from "../helpers/seed";
import { encryptSecret } from "../../src/crypto";
import { runDailyRecommendJob } from "../../src/recommend/run-daily-recommend";
import { createTestDb } from "../helpers/db";
import { createTestUser } from "../helpers/seed";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

// JST 2026-05-22 08:00 = UTC 2026-05-21 23:00
const FIXED_NOW = new Date("2026-05-21T23:00:00.000Z");

const seedArticles = async (
  count: number,
  options: { publishedAtBaseMs?: number; isRead?: boolean } = {},
) => {
  await db.insert(feed).values({
    id: "f1",
    userId: user.id,
    url: "https://example.com/feed",
    title: "Example Feed",
  });
  const base =
    options.publishedAtBaseMs ?? FIXED_NOW.getTime() - 60 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    await db.insert(article).values({
      id: `a${i}`,
      userId: user.id,
      feedId: "f1",
      url: `https://example.com/article-${i}`,
      title: `Article ${i}`,
      description: `desc-${i}`,
      isRead: options.isRead ?? false,
      publishedAt: new Date(base - i * 1000),
    });
  }
};

const enablePref = async (
  overrides: {
    hour?: number;
    enabled?: boolean;
    webhookCipher?: string | null;
  } = {},
) => {
  await db.insert(userPreference).values({
    id: "p1",
    userId: user.id,
    recommendationEnabled: overrides.enabled ?? true,
    recommendationHour: overrides.hour ?? 8,
    discordWebhookUrlEncrypted:
      overrides.webhookCipher === undefined ? null : overrides.webhookCipher,
  });
};

const mockGemini = (
  picks: { articleId: string; reason: string }[],
): VertexGeminiClient => ({
  generateRecommendations: vi.fn().mockResolvedValue(picks),
});

const failingGemini = (err: Error): VertexGeminiClient => ({
  generateRecommendations: vi.fn().mockRejectedValue(err),
});

// Deterministic "random" sampler: picks first N items in order.
const deterministicSample = <T>(items: T[], count: number): T[] =>
  items.slice(0, count);

describe("runDailyRecommendJob", () => {
  it("skips users whose hour does not match JST now", async () => {
    await seedArticles(10);
    await enablePref({ hour: 12 }); // not 8
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    expect(result.processed).toBe(0);
    expect(gemini.generateRecommendations).not.toHaveBeenCalled();
    const stored = await db.select().from(recommendation);
    expect(stored).toHaveLength(0);
  });

  it("skips users whose preferences are disabled", async () => {
    await seedArticles(10);
    await enablePref({ enabled: false });
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    expect(result.processed).toBe(0);
    expect(gemini.generateRecommendations).not.toHaveBeenCalled();
  });

  it("creates a recommendation with 5 AI + 5 random items when matched", async () => {
    await seedArticles(20);
    await enablePref();
    const gemini = mockGemini([
      { articleId: "a0", reason: "1" },
      { articleId: "a1", reason: "2" },
      { articleId: "a2", reason: "3" },
      { articleId: "a3", reason: "4" },
      { articleId: "a4", reason: "5" },
    ]);

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    expect(result.processed).toBe(1);
    const recs = await db.select().from(recommendation);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.date).toBe("2026-05-22");

    const items = await db
      .select()
      .from(recommendationItem)
      .where(eq(recommendationItem.recommendationId, recs[0]?.id ?? ""));
    expect(items).toHaveLength(10);
    expect(items.filter((i) => i.source === "ai")).toHaveLength(5);
    expect(items.filter((i) => i.source === "random")).toHaveLength(5);
  });

  it("excludes already-read and out-of-window articles from candidates", async () => {
    // Recent unread
    await db.insert(feed).values({
      id: "f1",
      userId: user.id,
      url: "https://example.com/feed",
      title: "Feed",
    });
    await db.insert(article).values([
      {
        id: "fresh",
        userId: user.id,
        feedId: "f1",
        url: "https://example.com/fresh",
        title: "Fresh",
        isRead: false,
        publishedAt: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000),
      },
      {
        id: "read",
        userId: user.id,
        feedId: "f1",
        url: "https://example.com/read",
        title: "Read",
        isRead: true,
        publishedAt: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000),
      },
      {
        id: "old",
        userId: user.id,
        feedId: "f1",
        url: "https://example.com/old",
        title: "Old",
        isRead: false,
        publishedAt: new Date(FIXED_NOW.getTime() - 48 * 60 * 60 * 1000),
      },
    ]);
    await enablePref();
    const gemini = mockGemini([]);

    await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    const passedCandidates = vi
      .mocked(gemini.generateRecommendations)
      .mock.calls[0]?.[0]?.candidates.map((c) => c.id);
    expect(passedCandidates).toEqual(["fresh"]);
  });

  it("skips a user whose recommendation already exists for today", async () => {
    await seedArticles(10);
    await enablePref();
    await db.insert(recommendation).values({
      id: "r-existing",
      userId: user.id,
      date: "2026-05-22",
    });
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    expect(result.skipped).toBe(1);
    expect(gemini.generateRecommendations).not.toHaveBeenCalled();
    const recs = await db.select().from(recommendation);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("r-existing");
  });

  it("falls back to all-random when the AI call throws", async () => {
    await seedArticles(20);
    await enablePref();
    const gemini = failingGemini(new Error("AI down"));

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    expect(result.processed).toBe(1);
    const recs = await db.select().from(recommendation);
    const items = await db
      .select()
      .from(recommendationItem)
      .where(eq(recommendationItem.recommendationId, recs[0]?.id ?? ""));
    expect(items).toHaveLength(10);
    expect(items.every((i) => i.source === "random")).toBe(true);
  });

  it("does not include the same article in both AI and random buckets", async () => {
    await seedArticles(20);
    await enablePref();
    // AI picks the first article; random must avoid it.
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);

    await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
    });

    const recs = await db.select().from(recommendation);
    const items = await db
      .select()
      .from(recommendationItem)
      .where(eq(recommendationItem.recommendationId, recs[0]?.id ?? ""));
    const ids = items.map((i) => i.articleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      items.filter((i) => i.source === "ai").map((i) => i.articleId),
    ).toEqual(["a0"]);
    // random should NOT contain a0
    const randomIds = items
      .filter((i) => i.source === "random")
      .map((i) => i.articleId);
    expect(randomIds).not.toContain("a0");
  });

  it("sends a Discord embed when the user has an encrypted webhook", async () => {
    await seedArticles(20);
    const cipher = await encryptSecret(
      "https://discord.com/api/webhooks/9/abc",
      TEST_KEY,
    );
    await enablePref({ webhookCipher: cipher });
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);
    const sendDiscord = vi.fn().mockResolvedValue(undefined);

    await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
      sendDiscord,
    });

    expect(sendDiscord).toHaveBeenCalledTimes(1);
    const arg = sendDiscord.mock.calls[0]?.[0];
    expect(arg.webhookUrl).toBe("https://discord.com/api/webhooks/9/abc");
    expect(arg.webPageUrl).toBe(
      "https://example.com/app/recommendations/today",
    );
    expect(arg.date).toBe("2026-05-22");
    expect(arg.aiItems).toHaveLength(1);
    expect(arg.randomItems.length).toBeGreaterThan(0);
  });

  it("does not abort the run if Discord sending fails", async () => {
    await seedArticles(20);
    const cipher = await encryptSecret(
      "https://discord.com/api/webhooks/9/abc",
      TEST_KEY,
    );
    await enablePref({ webhookCipher: cipher });
    const gemini = mockGemini([{ articleId: "a0", reason: "" }]);
    const sendDiscord = vi.fn().mockRejectedValue(new Error("Discord down"));

    const result = await runDailyRecommendJob({
      db,
      gemini,
      encryptionMasterKey: TEST_KEY,
      webBaseUrl: "https://example.com",
      now: () => FIXED_NOW,
      sample: deterministicSample,
      sendDiscord,
    });

    expect(result.processed).toBe(1);
    // Recommendation is still persisted
    const recs = await db.select().from(recommendation);
    expect(recs).toHaveLength(1);
  });
});
