import { Hono } from "hono";
import { inArray } from "drizzle-orm";

import type { ArticleFetcher, BookmarkContentFetcher } from "@acme/jobs";
import { bookmark, feed } from "@acme/db/schema";
import { ingestBookmarkContent, ingestFeedArticles } from "@acme/jobs";

import type {
  AppEnv,
  FeedFetcher,
  JobsDispatcher,
  OgFetcher,
} from "../../src/env";
import type { TestDb } from "./db";
import type { TestUser } from "./seed";
import { injectArticleFetcher } from "../../src/middleware/inject-article-fetcher";
import { injectDb } from "../../src/middleware/inject-db";
import { injectEncryptionKey } from "../../src/middleware/inject-encryption-key";
import { injectFeedFetcher } from "../../src/middleware/inject-feed-fetcher";
import { injectJobsDispatcher } from "../../src/middleware/inject-jobs-dispatcher";
import { injectOgFetcher } from "../../src/middleware/inject-og-fetcher";
import { articlesRouter } from "../../src/routes/articles";
import { bookmarksRouter } from "../../src/routes/bookmarks";
import { categoriesRouter } from "../../src/routes/categories";
import { feedsRouter } from "../../src/routes/feeds";
import { preferencesRouter } from "../../src/routes/preferences";
import { recommendationsRouter } from "../../src/routes/recommendations";
import { tagsRouter } from "../../src/routes/tags";

export interface BuildTestAppOptions {
  db: TestDb;
  user: TestUser | null;
  feedFetcher?: FeedFetcher;
  ogFetcher?: OgFetcher;
  articleFetcher?: ArticleFetcher;
  bookmarkContentFetcher?: BookmarkContentFetcher;
  jobsDispatcher?: JobsDispatcher;
  encryptionMasterKey?: string;
}

const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Default dispatcher used in tests — runs ingestion inline so assertions can
 * verify side effects synchronously. Production wires this to the worker-jobs
 * service binding instead, where ingestion runs in the background.
 */
const inlineDispatcher = (
  db: TestDb,
  articleFetcher: ArticleFetcher,
  bookmarkContentFetcher: BookmarkContentFetcher,
): JobsDispatcher => ({
  triggerFeedIngest: async (feedIds) => {
    if (feedIds.length === 0) {
      return;
    }
    const rows = await db
      .select({ id: feed.id, userId: feed.userId, url: feed.url })
      .from(feed)
      .where(inArray(feed.id, feedIds));
    for (const f of rows) {
      await ingestFeedArticles({ db: db as never, articleFetcher, feed: f });
    }
  },
  triggerBookmarkExtract: async (bookmarkIds) => {
    if (bookmarkIds.length === 0) {
      return;
    }
    const rows = await db
      .select({ id: bookmark.id, url: bookmark.url })
      .from(bookmark)
      .where(inArray(bookmark.id, bookmarkIds));
    for (const b of rows) {
      try {
        await ingestBookmarkContent({
          db: db as never,
          contentFetcher: bookmarkContentFetcher,
          bookmark: b,
        });
      } catch {
        // mirror prod: best-effort, errors swallowed
      }
    }
  },
});

export const buildTestApp = ({
  db,
  user,
  feedFetcher,
  ogFetcher,
  articleFetcher,
  bookmarkContentFetcher,
  jobsDispatcher,
  encryptionMasterKey = TEST_ENCRYPTION_KEY,
}: BuildTestAppOptions) => {
  const feedF: FeedFetcher = feedFetcher ?? {
    fetchMetadata: (url: string) =>
      Promise.resolve({ title: "stub", siteUrl: null, feedUrl: url }),
  };
  const ogF: OgFetcher = ogFetcher ?? {
    fetch: (url: string) =>
      Promise.resolve({ title: url, description: null, imageUrl: null }),
  };
  const articleF: ArticleFetcher = articleFetcher ?? {
    fetchArticles: () => Promise.resolve([]),
  };
  const contentF: BookmarkContentFetcher = bookmarkContentFetcher ?? {
    fetch: () => Promise.resolve({ title: null, markdown: "" }),
  };
  const jobsF: JobsDispatcher =
    jobsDispatcher ?? inlineDispatcher(db, articleF, contentF);
  return new Hono<AppEnv>()
    .use("*", injectDb(db as never))
    .use("*", injectFeedFetcher(feedF))
    .use("*", injectOgFetcher(ogF))
    .use("*", injectArticleFetcher(articleF))
    .use("*", injectJobsDispatcher(jobsF))
    .use("*", injectEncryptionKey(encryptionMasterKey))
    .use("*", async (c, next) => {
      c.set("user", (user ?? null) as never);
      c.set("session", null);
      await next();
    })
    .route("/feeds", feedsRouter)
    .route("/articles", articlesRouter)
    .route("/bookmarks", bookmarksRouter)
    .route("/categories", categoriesRouter)
    .route("/tags", tagsRouter)
    .route("/preferences", preferencesRouter)
    .route("/recommendations", recommendationsRouter);
};
