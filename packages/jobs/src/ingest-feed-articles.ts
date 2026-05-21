import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import type { DbType } from "@acme/db/client";
import { article, feed } from "@acme/db/schema";

import type { ArticleFetcher } from "./article-fetcher";

export interface IngestFeedArticlesOptions {
  db: DbType;
  articleFetcher: ArticleFetcher;
  feed: {
    id: string;
    userId: string;
    url: string;
  };
}

export interface IngestFeedArticlesResult {
  inserted: number;
}

export const ingestFeedArticles = async (
  options: IngestFeedArticlesOptions,
): Promise<IngestFeedArticlesResult> => {
  const { db, articleFetcher, feed: f } = options;
  const fetched = await articleFetcher.fetchArticles(f.url);

  let inserted = 0;
  if (fetched.length > 0) {
    // Some feeds publish multiple items with the same URL (e.g. republished
    // posts). Dedup the incoming batch first so the unique constraint on
    // (feed_id, url) doesn't reject the whole insert.
    const seen = new Set<string>();
    const uniqueFetched = fetched.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    const urls = uniqueFetched.map((a) => a.url);
    const existing = await db
      .select({ url: article.url })
      .from(article)
      .where(and(eq(article.feedId, f.id), inArray(article.url, urls)));
    const existingSet = new Set(existing.map((r) => r.url));

    const toInsert = uniqueFetched
      .filter((a) => !existingSet.has(a.url))
      .map((a) => ({
        id: randomUUID(),
        userId: f.userId,
        feedId: f.id,
        url: a.url,
        title: a.title,
        description: a.description,
        ogImageUrl: a.ogImageUrl,
        publishedAt: a.publishedAt,
      }));

    if (toInsert.length > 0) {
      await db.insert(article).values(toInsert);
      inserted = toInsert.length;
    }
  }

  await db
    .update(feed)
    .set({ lastFetchedAt: new Date() })
    .where(eq(feed.id, f.id));

  return { inserted };
};
