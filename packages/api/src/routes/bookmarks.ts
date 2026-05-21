import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { article, bookmark, bookmarkTag, tag } from "@acme/db/schema";
import {
  buildAndQuery,
  removeBookmarkFts,
  removeBookmarkFtsMany,
  syncBookmarkFts,
} from "@acme/jobs";

import type { AppEnv } from "../env";

interface TagSummary {
  id: string;
  name: string;
}

const createBodySchema = z.object({
  url: z.url(),
  contentMarkdown: z.string().optional(),
  articleId: z.string().optional(),
});

const bulkDeleteBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

const patchBodySchema = z.object({
  tagIds: z.array(z.string().min(1)),
});

const bulkAddTagsBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  tagIds: z.array(z.string().min(1)).min(1),
});

const collectTagsByBookmark = async (
  db: AppEnv["Variables"]["db"],
  bookmarkIds: string[],
): Promise<Map<string, TagSummary[]>> => {
  if (bookmarkIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      bookmarkId: bookmarkTag.bookmarkId,
      id: tag.id,
      name: tag.name,
    })
    .from(bookmarkTag)
    .innerJoin(tag, eq(bookmarkTag.tagId, tag.id))
    .where(inArray(bookmarkTag.bookmarkId, bookmarkIds));
  const map = new Map<string, TagSummary[]>();
  for (const r of rows) {
    const arr = map.get(r.bookmarkId) ?? [];
    arr.push({ id: r.id, name: r.name });
    map.set(r.bookmarkId, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
};

const assertTagsOwned = async (
  db: AppEnv["Variables"]["db"],
  userId: string,
  tagIds: string[],
): Promise<boolean> => {
  if (tagIds.length === 0) {
    return true;
  }
  const owned = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.userId, userId), inArray(tag.id, tagIds)));
  const ownedSet = new Set(owned.map((r) => r.id));
  return tagIds.every((id) => ownedSet.has(id));
};

export const bookmarksRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const tagId = c.req.query("tagId");
    const q = c.req.query("q");

    // Full-text search path: resolve matching ids via FTS5 first, then load
    // bookmark rows and re-order by FTS bm25 score.
    if (q) {
      const ftsExpr = buildAndQuery(q);
      if (!ftsExpr) {
        return c.json([]);
      }
      const matchedRaw = await db.all(sql`
        SELECT bookmark_id AS id, bm25(bookmark_fts) AS score
        FROM bookmark_fts
        WHERE bookmark_fts MATCH ${ftsExpr}
        ORDER BY score
        LIMIT 100
      `);
      const matched = matchedRaw as { id: string; score: number }[];
      if (matched.length === 0) {
        return c.json([]);
      }
      const idOrder = new Map(matched.map((m, i) => [m.id, i]));
      const ids = matched.map((m) => m.id);

      const conditions = [
        eq(bookmark.userId, user.id),
        inArray(bookmark.id, ids),
      ];
      let rows;
      if (tagId) {
        rows = await db
          .select({
            id: bookmark.id,
            userId: bookmark.userId,
            articleId: bookmark.articleId,
            url: bookmark.url,
            title: bookmark.title,
            description: bookmark.description,
            ogImageUrl: bookmark.ogImageUrl,
            contentMarkdown: bookmark.contentMarkdown,
            createdAt: bookmark.createdAt,
            updatedAt: bookmark.updatedAt,
          })
          .from(bookmark)
          .innerJoin(bookmarkTag, eq(bookmarkTag.bookmarkId, bookmark.id))
          .where(and(...conditions, eq(bookmarkTag.tagId, tagId)));
      } else {
        rows = await db
          .select()
          .from(bookmark)
          .where(and(...conditions));
      }

      rows.sort(
        (a, b) =>
          (idOrder.get(a.id) ?? Infinity) - (idOrder.get(b.id) ?? Infinity),
      );

      const tagsByBookmark = await collectTagsByBookmark(
        db,
        rows.map((r) => r.id),
      );
      return c.json(
        rows.map((r) => ({ ...r, tags: tagsByBookmark.get(r.id) ?? [] })),
      );
    }

    let rows;
    if (tagId) {
      rows = await db
        .select({
          id: bookmark.id,
          userId: bookmark.userId,
          articleId: bookmark.articleId,
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.description,
          ogImageUrl: bookmark.ogImageUrl,
          contentMarkdown: bookmark.contentMarkdown,
          createdAt: bookmark.createdAt,
          updatedAt: bookmark.updatedAt,
        })
        .from(bookmark)
        .innerJoin(bookmarkTag, eq(bookmarkTag.bookmarkId, bookmark.id))
        .where(and(eq(bookmark.userId, user.id), eq(bookmarkTag.tagId, tagId)))
        .orderBy(desc(bookmark.createdAt));
    } else {
      rows = await db
        .select()
        .from(bookmark)
        .where(eq(bookmark.userId, user.id))
        .orderBy(desc(bookmark.createdAt));
    }

    const tagsByBookmark = await collectTagsByBookmark(
      db,
      rows.map((r) => r.id),
    );
    return c.json(
      rows.map((r) => ({ ...r, tags: tagsByBookmark.get(r.id) ?? [] })),
    );
  })
  .get("/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const id = c.req.param("id");
    const row = await db
      .select()
      .from(bookmark)
      .where(and(eq(bookmark.id, id), eq(bookmark.userId, user.id)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }
    const tagsMap = await collectTagsByBookmark(db, [id]);
    return c.json({ ...row, tags: tagsMap.get(id) ?? [] });
  })
  .post(
    "/",
    zValidator("json", createBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const db = c.get("db");
      const ogFetcher = c.get("ogFetcher");
      const { url, contentMarkdown, articleId } = c.req.valid("json");

      if (articleId) {
        const owned = await db
          .select({ id: article.id })
          .from(article)
          .where(and(eq(article.id, articleId), eq(article.userId, user.id)))
          .get();
        if (!owned) {
          return c.json({ error: "Invalid articleId" }, 400);
        }
      }

      const existing = await db
        .select({ id: bookmark.id })
        .from(bookmark)
        .where(and(eq(bookmark.userId, user.id), eq(bookmark.url, url)))
        .get();
      if (existing) {
        return c.json({ error: "Bookmark already exists" }, 409);
      }

      let og;
      try {
        og = await ogFetcher.fetch(url);
      } catch {
        return c.json({ error: "Could not fetch the page" }, 422);
      }

      const id = randomUUID();
      await db.insert(bookmark).values({
        id,
        userId: user.id,
        articleId: articleId ?? null,
        url,
        title: og.title,
        description: og.description,
        ogImageUrl: og.imageUrl,
        contentMarkdown: contentMarkdown ?? null,
      });
      const created = await db
        .select()
        .from(bookmark)
        .where(eq(bookmark.id, id))
        .get();

      // Index for full-text search. Content markdown will be re-synced after
      // readability extraction completes, but seeding here with title + desc
      // makes the bookmark findable immediately.
      await syncBookmarkFts(db, {
        id,
        title: og.title,
        description: og.description,
        contentMarkdown: contentMarkdown ?? null,
      });

      // Kick off readability extraction in worker-jobs. Skip dispatch when the
      // caller already supplied markdown (e.g. via an extension).
      if (!contentMarkdown) {
        try {
          await c.get("jobsDispatcher").triggerBookmarkExtract([id]);
        } catch (err) {
          console.error("[bookmarks] failed to dispatch extract:", err);
        }
      }

      return c.json({ ...created, tags: [] as TagSummary[] }, 201);
    },
  )
  .patch(
    "/:id",
    zValidator("json", patchBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const db = c.get("db");
      const id = c.req.param("id");
      const { tagIds } = c.req.valid("json");

      const owned = await db
        .select({ id: bookmark.id })
        .from(bookmark)
        .where(and(eq(bookmark.id, id), eq(bookmark.userId, user.id)))
        .get();
      if (!owned) {
        return c.json({ error: "Not Found" }, 404);
      }
      const uniqueIds = [...new Set(tagIds)];
      if (!(await assertTagsOwned(db, user.id, uniqueIds))) {
        return c.json({ error: "Invalid tagIds" }, 400);
      }

      await db.delete(bookmarkTag).where(eq(bookmarkTag.bookmarkId, id));
      if (uniqueIds.length > 0) {
        await db
          .insert(bookmarkTag)
          .values(uniqueIds.map((tagId) => ({ bookmarkId: id, tagId })));
      }

      const row = await db
        .select()
        .from(bookmark)
        .where(eq(bookmark.id, id))
        .get();
      const tagsMap = await collectTagsByBookmark(db, [id]);
      return c.json({ ...row, tags: tagsMap.get(id) ?? [] });
    },
  )
  .post(
    "/bulk-add-tags",
    zValidator("json", bulkAddTagsBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const db = c.get("db");
      const { ids, tagIds } = c.req.valid("json");
      const uniqueTagIds = [...new Set(tagIds)];
      if (!(await assertTagsOwned(db, user.id, uniqueTagIds))) {
        return c.json({ error: "Invalid tagIds" }, 400);
      }
      const ownedBookmarks = await db
        .select({ id: bookmark.id })
        .from(bookmark)
        .where(and(eq(bookmark.userId, user.id), inArray(bookmark.id, ids)));
      const ownedIds = ownedBookmarks.map((r) => r.id);
      if (ownedIds.length === 0) {
        return c.json({ updated: 0, added: 0 });
      }

      const existingLinks = await db
        .select({
          bookmarkId: bookmarkTag.bookmarkId,
          tagId: bookmarkTag.tagId,
        })
        .from(bookmarkTag)
        .where(
          and(
            inArray(bookmarkTag.bookmarkId, ownedIds),
            inArray(bookmarkTag.tagId, uniqueTagIds),
          ),
        );
      const existingPairs = new Set(
        existingLinks.map((r) => `${r.bookmarkId}::${r.tagId}`),
      );

      const toInsert: { bookmarkId: string; tagId: string }[] = [];
      for (const bId of ownedIds) {
        for (const tId of uniqueTagIds) {
          if (!existingPairs.has(`${bId}::${tId}`)) {
            toInsert.push({ bookmarkId: bId, tagId: tId });
          }
        }
      }
      if (toInsert.length > 0) {
        await db.insert(bookmarkTag).values(toInsert);
      }
      return c.json({
        updated: ownedIds.length,
        added: toInsert.length,
      });
    },
  )
  .post(
    "/bulk-delete",
    zValidator("json", bulkDeleteBodySchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const db = c.get("db");
      const { ids } = c.req.valid("json");
      await db.delete(bookmarkTag).where(inArray(bookmarkTag.bookmarkId, ids));
      const result = await db
        .delete(bookmark)
        .where(and(eq(bookmark.userId, user.id), inArray(bookmark.id, ids)))
        .returning({ id: bookmark.id });
      await removeBookmarkFtsMany(
        db,
        result.map((r) => r.id),
      );
      return c.json({ deleted: result.length });
    },
  )
  .delete("/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const id = c.req.param("id");
    const row = await db
      .select({ id: bookmark.id })
      .from(bookmark)
      .where(and(eq(bookmark.id, id), eq(bookmark.userId, user.id)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }
    await db.delete(bookmarkTag).where(eq(bookmarkTag.bookmarkId, id));
    await db.delete(bookmark).where(eq(bookmark.id, id));
    await removeBookmarkFts(db, id);
    return c.body(null, 204);
  });
