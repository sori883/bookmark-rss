import type { DbType } from "@acme/db/client";
import { feed } from "@acme/db/schema";

import type { ArticleFetcher } from "./article-fetcher";
import { ingestFeedArticles } from "./ingest-feed-articles";

export interface RunFeedFetchOptions {
  db: DbType;
  articleFetcher: ArticleFetcher;
  onError?: (feedId: string, feedUrl: string, error: unknown) => void;
}

export interface RunFeedFetchResult {
  feedsProcessed: number;
  feedsFailed: number;
  articlesInserted: number;
}

export const runFeedFetchJob = async (
  options: RunFeedFetchOptions,
): Promise<RunFeedFetchResult> => {
  const { db, articleFetcher, onError } = options;

  const feeds = await db
    .select({
      id: feed.id,
      userId: feed.userId,
      url: feed.url,
    })
    .from(feed);

  let feedsProcessed = 0;
  let feedsFailed = 0;
  let articlesInserted = 0;

  for (const f of feeds) {
    feedsProcessed++;
    try {
      const { inserted } = await ingestFeedArticles({
        db,
        articleFetcher,
        feed: f,
      });
      articlesInserted += inserted;
    } catch (err) {
      feedsFailed++;
      onError?.(f.id, f.url, err);
    }
  }

  return { feedsProcessed, feedsFailed, articlesInserted };
};
