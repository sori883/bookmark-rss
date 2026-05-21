import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";

import type { DbType } from "@acme/db/client";
import {
  article,
  bookmark,
  recommendation,
  recommendationItem,
  userPreference,
} from "@acme/db/schema";

import type { SendRecommendationParams } from "./discord-notifier";
import type { VertexGeminiClient } from "./vertex-gemini";
import { decryptSecret } from "../crypto";
import { sendRecommendationDiscord } from "./discord-notifier";

const UNREAD_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_UNREAD = 50;
const MAX_BOOKMARKS = 30;
const AI_COUNT = 5;
const TOTAL_COUNT = 10;
const JST_OFFSET_MIN = 9 * 60;

const defaultSample = <T>(items: T[], count: number): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy.slice(0, count);
};

const toJstParts = (date: Date) => {
  const utcMs = date.getTime();
  const jst = new Date(utcMs + JST_OFFSET_MIN * 60 * 1000);
  return {
    hour: jst.getUTCHours(),
    dateString: jst.toISOString().slice(0, 10),
  };
};

export interface RunDailyRecommendDeps {
  db: DbType;
  gemini: VertexGeminiClient;
  encryptionMasterKey: string;
  webBaseUrl: string;
  now?: () => Date;
  sample?: <T>(items: T[], count: number) => T[];
  sendDiscord?: (params: SendRecommendationParams) => Promise<void>;
}

export interface RunDailyRecommendResult {
  processed: number;
  skipped: number;
  failed: number;
}

export const runDailyRecommendJob = async (
  deps: RunDailyRecommendDeps,
): Promise<RunDailyRecommendResult> => {
  const now = deps.now ? deps.now() : new Date();
  const { hour, dateString } = toJstParts(now);
  const sample = deps.sample ?? defaultSample;
  const sendDiscord = deps.sendDiscord ?? sendRecommendationDiscord;

  const matchedUsers = await deps.db
    .select()
    .from(userPreference)
    .where(
      and(
        eq(userPreference.recommendationEnabled, true),
        eq(userPreference.recommendationHour, hour),
      ),
    );

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const pref of matchedUsers) {
    try {
      const result = await processUser({
        pref,
        now,
        dateString,
        deps,
        sample,
        sendDiscord,
      });
      if (result === "processed") {
        processed += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      console.error(`[runDailyRecommendJob] user ${pref.userId} failed:`, err);
      failed += 1;
    }
  }

  return { processed, skipped, failed };
};

interface ProcessUserInput {
  pref: typeof userPreference.$inferSelect;
  now: Date;
  dateString: string;
  deps: RunDailyRecommendDeps;
  sample: <T>(items: T[], count: number) => T[];
  sendDiscord: (params: SendRecommendationParams) => Promise<void>;
}

const processUser = async ({
  pref,
  now,
  dateString,
  deps,
  sample,
  sendDiscord,
}: ProcessUserInput): Promise<"processed" | "skipped"> => {
  const existing = await deps.db
    .select({ id: recommendation.id })
    .from(recommendation)
    .where(
      and(
        eq(recommendation.userId, pref.userId),
        eq(recommendation.date, dateString),
      ),
    )
    .get();
  if (existing) {
    return "skipped";
  }

  const cutoff = new Date(now.getTime() - UNREAD_WINDOW_MS);
  const unread = await deps.db
    .select()
    .from(article)
    .where(
      and(
        eq(article.userId, pref.userId),
        eq(article.isRead, false),
        gte(article.publishedAt, cutoff),
      ),
    )
    .orderBy(desc(article.publishedAt))
    .limit(MAX_UNREAD);

  if (unread.length === 0) {
    return "skipped";
  }

  const userBookmarks = await deps.db
    .select({
      title: bookmark.title,
      description: bookmark.description,
    })
    .from(bookmark)
    .where(eq(bookmark.userId, pref.userId))
    .orderBy(desc(bookmark.createdAt))
    .limit(MAX_BOOKMARKS);

  let aiPicks: { articleId: string; reason: string }[] = [];
  try {
    aiPicks = await deps.gemini.generateRecommendations({
      bookmarks: userBookmarks.map((b) => ({
        title: b.title,
        description: b.description,
      })),
      candidates: unread.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
      })),
      count: AI_COUNT,
    });
  } catch (err) {
    console.error(
      `[runDailyRecommendJob] gemini failed for ${pref.userId}:`,
      err,
    );
  }

  const aiIds = new Set(aiPicks.map((p) => p.articleId));
  const remaining = unread.filter((a) => !aiIds.has(a.id));
  const randomCount = TOTAL_COUNT - aiPicks.length;
  const randomPicks = sample(remaining, randomCount);

  const recId = randomUUID();
  await deps.db.insert(recommendation).values({
    id: recId,
    userId: pref.userId,
    date: dateString,
    generatedAt: now,
  });

  const articleById = new Map(unread.map((a) => [a.id, a]));
  const items = [
    ...aiPicks.map((p, i) => ({
      id: randomUUID(),
      recommendationId: recId,
      articleId: p.articleId,
      source: "ai" as const,
      rank: i,
      reason: p.reason || null,
    })),
    ...randomPicks.map((a, i) => ({
      id: randomUUID(),
      recommendationId: recId,
      articleId: a.id,
      source: "random" as const,
      rank: aiPicks.length + i,
      reason: null,
    })),
  ];
  if (items.length > 0) {
    await deps.db.insert(recommendationItem).values(items);
  }

  if (pref.discordWebhookUrlEncrypted) {
    try {
      const webhookUrl = await decryptSecret(
        pref.discordWebhookUrlEncrypted,
        deps.encryptionMasterKey,
      );
      const proxyUrl = (articleId: string) =>
        `${deps.webBaseUrl}/r/${articleId}`;
      const aiItems = aiPicks.flatMap((p) => {
        const art = articleById.get(p.articleId);
        return art
          ? [{ title: art.title, url: proxyUrl(art.id), reason: p.reason }]
          : [];
      });
      const randomItems = randomPicks.map((a) => ({
        title: a.title,
        url: proxyUrl(a.id),
      }));
      await sendDiscord({
        webhookUrl,
        date: dateString,
        webPageUrl: `${deps.webBaseUrl}/app/recommendations/today`,
        aiItems,
        randomItems,
      });
    } catch (err) {
      console.error(
        `[runDailyRecommendJob] discord notify failed for ${pref.userId}:`,
        err,
      );
    }
  }

  return "processed";
};
