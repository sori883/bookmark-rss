import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { category, feed } from "@acme/db/schema";

import type { AppEnv } from "../env";
import { parseOpml } from "../services/opml-parser";

const createBodySchema = z.object({
  url: z.url(),
});

const importBodySchema = z.object({
  opml: z.string().min(1),
});

const bulkDeleteBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

const patchBodySchema = z.object({
  categoryId: z.string().min(1).nullable(),
});

const bulkUpdateCategoryBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1).nullable(),
});

export const feedsRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const rows = await db.select().from(feed).where(eq(feed.userId, user.id));
    return c.json(rows);
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
      .from(feed)
      .where(and(eq(feed.id, id), eq(feed.userId, user.id)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(row);
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
      const fetcher = c.get("feedFetcher");
      const { url } = c.req.valid("json");

      let meta;
      try {
        meta = await fetcher.fetchMetadata(url);
      } catch {
        return c.json({ error: "Could not discover a feed at the URL" }, 422);
      }

      const existing = await db
        .select({ id: feed.id })
        .from(feed)
        .where(and(eq(feed.userId, user.id), eq(feed.url, meta.feedUrl)))
        .get();
      if (existing) {
        return c.json({ error: "Feed already registered" }, 409);
      }

      const id = randomUUID();
      await db.insert(feed).values({
        id,
        userId: user.id,
        url: meta.feedUrl,
        title: meta.title,
        siteUrl: meta.siteUrl,
      });
      const created = await db.select().from(feed).where(eq(feed.id, id)).get();

      // Hand off ingestion to the jobs worker. The dispatcher returns once
      // the worker has accepted the request (~50ms) and the worker runs the
      // actual fetch in waitUntil — so this POST stays fast even for OPML
      // bulk imports.
      try {
        await c.get("jobsDispatcher").triggerFeedIngest([id]);
      } catch (err) {
        console.error("[feeds] failed to dispatch ingest:", err);
      }

      return c.json(created, 201);
    },
  )
  .post(
    "/import",
    zValidator("json", importBodySchema, (result, c) => {
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
      const { opml } = c.req.valid("json");

      let entries;
      try {
        entries = parseOpml(opml);
      } catch {
        return c.json({ error: "Invalid OPML" }, 400);
      }

      const seen = new Set<string>();
      const unique = entries.filter((e) => {
        if (seen.has(e.feedUrl)) {
          return false;
        }
        seen.add(e.feedUrl);
        return true;
      });
      const total = entries.length;

      if (unique.length === 0) {
        return c.json({ imported: 0, skipped: total, total });
      }

      const urls = unique.map((e) => e.feedUrl);
      const existing = await db
        .select({ url: feed.url })
        .from(feed)
        .where(and(eq(feed.userId, user.id), inArray(feed.url, urls)));
      const existingSet = new Set(existing.map((r) => r.url));

      const toInsert = unique.map((e) => ({
        id: randomUUID(),
        userId: user.id,
        url: e.feedUrl,
        title: e.title,
        siteUrl: e.siteUrl,
      }));
      const newFeeds = toInsert.filter((row) => !existingSet.has(row.url));
      if (newFeeds.length > 0) {
        await db.insert(feed).values(newFeeds);
        try {
          await c
            .get("jobsDispatcher")
            .triggerFeedIngest(newFeeds.map((f) => f.id));
        } catch (err) {
          console.error("[feeds/import] failed to dispatch ingest:", err);
        }
      }
      return c.json({
        imported: newFeeds.length,
        skipped: total - newFeeds.length,
        total,
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
      const result = await db
        .delete(feed)
        .where(and(eq(feed.userId, user.id), inArray(feed.id, ids)))
        .returning({ id: feed.id });
      return c.json({ deleted: result.length });
    },
  )
  .post(
    "/bulk-update-category",
    zValidator("json", bulkUpdateCategoryBodySchema, (result, c) => {
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
      const { ids, categoryId } = c.req.valid("json");

      if (categoryId !== null) {
        const cat = await db
          .select({ id: category.id })
          .from(category)
          .where(
            and(eq(category.id, categoryId), eq(category.userId, user.id)),
          )
          .get();
        if (!cat) {
          return c.json({ error: "Invalid categoryId" }, 400);
        }
      }

      const result = await db
        .update(feed)
        .set({ categoryId })
        .where(and(eq(feed.userId, user.id), inArray(feed.id, ids)))
        .returning({ id: feed.id });
      return c.json({ updated: result.length });
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
      const { categoryId } = c.req.valid("json");

      const owned = await db
        .select({ id: feed.id })
        .from(feed)
        .where(and(eq(feed.id, id), eq(feed.userId, user.id)))
        .get();
      if (!owned) {
        return c.json({ error: "Not Found" }, 404);
      }

      if (categoryId !== null) {
        const cat = await db
          .select({ id: category.id })
          .from(category)
          .where(
            and(eq(category.id, categoryId), eq(category.userId, user.id)),
          )
          .get();
        if (!cat) {
          return c.json({ error: "Invalid categoryId" }, 400);
        }
      }

      await db.update(feed).set({ categoryId }).where(eq(feed.id, id));
      const updated = await db
        .select()
        .from(feed)
        .where(eq(feed.id, id))
        .get();
      return c.json(updated);
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
      .select({ id: feed.id })
      .from(feed)
      .where(and(eq(feed.id, id), eq(feed.userId, user.id)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }
    await db.delete(feed).where(eq(feed.id, id));
    return c.body(null, 204);
  });
