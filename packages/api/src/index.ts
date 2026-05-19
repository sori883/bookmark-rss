import { Hono } from "hono";

import type { Auth } from "@acme/auth";
import type { DbType } from "@acme/db/client";
import type { ArticleFetcher } from "@acme/jobs";

import type { AppEnv, FeedFetcher, JobsDispatcher, OgFetcher } from "./env";
import { injectArticleFetcher } from "./middleware/inject-article-fetcher";
import { injectDb } from "./middleware/inject-db";
import { injectFeedFetcher } from "./middleware/inject-feed-fetcher";
import { injectJobsDispatcher } from "./middleware/inject-jobs-dispatcher";
import { injectOgFetcher } from "./middleware/inject-og-fetcher";
import { loadSession } from "./middleware/load-session";
import { requireAuth } from "./middleware/require-auth";
import { articlesRouter } from "./routes/articles";
import { bookmarksRouter } from "./routes/bookmarks";
import { categoriesRouter } from "./routes/categories";
import { feedsRouter } from "./routes/feeds";
import { tagsRouter } from "./routes/tags";

export const createApp = (deps: {
  auth: Auth;
  db: DbType;
  feedFetcher: FeedFetcher;
  ogFetcher: OgFetcher;
  articleFetcher: ArticleFetcher;
  jobsDispatcher: JobsDispatcher;
}) =>
  new Hono<AppEnv>()
    .basePath("/api/main")
    .use("*", injectDb(deps.db))
    .use("*", injectFeedFetcher(deps.feedFetcher))
    .use("*", injectOgFetcher(deps.ogFetcher))
    .use("*", injectArticleFetcher(deps.articleFetcher))
    .use("*", injectJobsDispatcher(deps.jobsDispatcher))
    .use("*", loadSession(deps.auth))
    .get("/me", requireAuth, (c) => c.json(c.get("user")))
    .route("/feeds", feedsRouter)
    .route("/articles", articlesRouter)
    .route("/bookmarks", bookmarksRouter)
    .route("/categories", categoriesRouter)
    .route("/tags", tagsRouter);

export type AppType = ReturnType<typeof createApp>;
export type {
  ArticleFetcher,
  FeedFetcher,
  FeedMetadata,
  JobsDispatcher,
  OgFetcher,
  OgMetadata,
} from "./env";
export { createDefaultFeedFetcher } from "./services/feed-fetcher";
export { createDefaultOgFetcher } from "./services/og-fetcher";
export { createDefaultArticleFetcher } from "@acme/jobs";
