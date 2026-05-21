import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";

import { article, recommendation, recommendationItem } from "@acme/db/schema";

import type { AppEnv } from "../env";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const todayJstString = (now: Date = new Date()): string =>
  new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

interface RecommendationItemResponse {
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
}

interface RecommendationResponse {
  date: string;
  generatedAt: Date;
  items: RecommendationItemResponse[];
}

const loadRecommendation = async (
  db: AppEnv["Variables"]["db"],
  userId: string,
  date: string,
): Promise<RecommendationResponse | null> => {
  const head = await db
    .select()
    .from(recommendation)
    .where(
      and(eq(recommendation.userId, userId), eq(recommendation.date, date)),
    )
    .get();
  if (!head) {
    return null;
  }
  const rows = await db
    .select({
      articleId: recommendationItem.articleId,
      source: recommendationItem.source,
      rank: recommendationItem.rank,
      reason: recommendationItem.reason,
      article: {
        id: article.id,
        title: article.title,
        url: article.url,
        description: article.description,
        ogImageUrl: article.ogImageUrl,
      },
    })
    .from(recommendationItem)
    .innerJoin(article, eq(recommendationItem.articleId, article.id))
    .where(eq(recommendationItem.recommendationId, head.id))
    .orderBy(asc(recommendationItem.rank));
  return {
    date: head.date,
    generatedAt: head.generatedAt,
    items: rows,
  };
};

export const recommendationsRouter = new Hono<AppEnv>()
  .get("/today", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const date = todayJstString();
    const result = await loadRecommendation(db, user.id, date);
    if (!result) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(result);
  })
  .get("/:date", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const date = c.req.param("date");
    if (!DATE_PATTERN.test(date)) {
      return c.json(
        { error: "Invalid date format (expected YYYY-MM-DD)" },
        400,
      );
    }
    const db = c.get("db");
    const result = await loadRecommendation(db, user.id, date);
    if (!result) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(result);
  });
