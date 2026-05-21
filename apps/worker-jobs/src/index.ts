import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import type { DbType } from "@acme/db/client";
import type { ArticleFetcher, BookmarkContentFetcher } from "@acme/jobs";
import { createDbClient } from "@acme/db/client";
import { bookmark, feed } from "@acme/db/schema";
import {
  createDefaultArticleFetcher,
  createDefaultBookmarkContentFetcher,
  createVertexGeminiClient,
  ingestBookmarkContent,
  ingestFeedArticles,
  runDailyRecommendJob,
  runFeedFetchJob,
} from "@acme/jobs";

interface Env {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  ENCRYPTION_MASTER_KEY: string;
  GCP_PROJECT_ID: string;
  GCP_SERVICE_ACCOUNT_EMAIL: string;
  GCP_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  VERTEX_AI_LOCATION: string;
  VERTEX_AI_MODEL: string;
  WEB_BASE_URL: string;
}

interface Deps {
  db: DbType;
  articleFetcher: ArticleFetcher;
  contentFetcher: BookmarkContentFetcher;
}

const buildDeps = (env: Env): Deps => ({
  db: createDbClient({
    url: env.DATABASE_URL,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN,
  }),
  articleFetcher: createDefaultArticleFetcher(),
  contentFetcher: createDefaultBookmarkContentFetcher(),
});

const runAll = async (env: Env): Promise<void> => {
  const { db, articleFetcher } = buildDeps(env);
  const result = await runFeedFetchJob({
    db,
    articleFetcher,
    onError: (feedId, feedUrl, err) => {
      console.error(`[feed-fetch] feed=${feedId} url=${feedUrl} error=`, err);
    },
  });
  console.log(
    `[feed-fetch] processed=${result.feedsProcessed} failed=${result.feedsFailed} inserted=${result.articlesInserted}`,
  );
};

const runRecommend = async (env: Env): Promise<void> => {
  const { db } = buildDeps(env);
  const gemini = createVertexGeminiClient({
    projectId: env.GCP_PROJECT_ID,
    location: env.VERTEX_AI_LOCATION,
    model: env.VERTEX_AI_MODEL,
    serviceAccountEmail: env.GCP_SERVICE_ACCOUNT_EMAIL,
    serviceAccountPrivateKey: env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  const result = await runDailyRecommendJob({
    db,
    gemini,
    encryptionMasterKey: env.ENCRYPTION_MASTER_KEY,
    webBaseUrl: env.WEB_BASE_URL,
  });
  console.log(
    `[recommend] processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`,
  );
};

const runIngest = async (env: Env, feedIds: string[]): Promise<void> => {
  if (feedIds.length === 0) return;
  const { db, articleFetcher } = buildDeps(env);
  const feeds = await db
    .select({ id: feed.id, userId: feed.userId, url: feed.url })
    .from(feed)
    .where(inArray(feed.id, feedIds));
  for (const f of feeds) {
    try {
      const { inserted } = await ingestFeedArticles({
        db,
        articleFetcher,
        feed: f,
      });
      console.log(`[ingest] feed=${f.id} inserted=${inserted}`);
    } catch (err) {
      console.error(`[ingest] feed=${f.id} url=${f.url} error=`, err);
    }
  }
};

const runExtract = async (env: Env, bookmarkIds: string[]): Promise<void> => {
  if (bookmarkIds.length === 0) return;
  const { db, contentFetcher } = buildDeps(env);
  const rows = await db
    .select({ id: bookmark.id, url: bookmark.url })
    .from(bookmark)
    .where(inArray(bookmark.id, bookmarkIds));
  for (const b of rows) {
    try {
      const { contentLength } = await ingestBookmarkContent({
        db,
        contentFetcher,
        bookmark: b,
      });
      console.log(`[extract] bookmark=${b.id} length=${contentLength}`);
    } catch (err) {
      console.error(`[extract] bookmark=${b.id} url=${b.url} error=`, err);
    }
  }
};

const ingestBodySchema = z.object({
  feedIds: z.array(z.string().min(1)).min(1),
});

const extractBodySchema = z.object({
  bookmarkIds: z.array(z.string().min(1)).min(1),
});

const app = new Hono<{ Bindings: Env }>()
  .get("/", (c) => c.text("ok"))
  .post("/trigger", (c) => {
    c.executionCtx.waitUntil(runAll(c.env));
    return c.json({ status: "triggered" }, 202);
  })
  .post(
    "/ingest",
    zValidator("json", ingestBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    (c) => {
      const { feedIds } = c.req.valid("json");
      c.executionCtx.waitUntil(runIngest(c.env, feedIds));
      return c.json({ status: "queued", count: feedIds.length }, 202);
    },
  )
  .post(
    "/extract-bookmarks",
    zValidator("json", extractBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    (c) => {
      const { bookmarkIds } = c.req.valid("json");
      c.executionCtx.waitUntil(runExtract(c.env, bookmarkIds));
      return c.json({ status: "queued", count: bookmarkIds.length }, 202);
    },
  );

export default {
  fetch: app.fetch,
  scheduled(_event, env, ctx) {
    ctx.waitUntil(runAll(env));
    ctx.waitUntil(runRecommend(env));
  },
} satisfies ExportedHandler<Env>;
