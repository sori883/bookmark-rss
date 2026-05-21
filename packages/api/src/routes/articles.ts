import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { article, feed } from "@acme/db/schema";

import type { AppEnv } from "../env";

const UNCATEGORIZED_PARAM = "none";
const PAGE_SIZE = 50;

const listQuerySchema = z.object({
  feedId: z.string().optional(),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) =>
      v === "true" ? true : v === "false" ? false : undefined,
    ),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

const patchBodySchema = z.object({
  isRead: z.boolean(),
});

export const articlesRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const parsed = listQuerySchema.safeParse({
      feedId: c.req.query("feedId"),
      unread: c.req.query("unread"),
      categoryId: c.req.query("categoryId"),
      page: c.req.query("page"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid query" }, 400);
    }
    const { feedId, unread, categoryId, page = 1 } = parsed.data;
    const offset = (page - 1) * PAGE_SIZE;
    const conditions = [eq(article.userId, user.id)];
    if (feedId) {
      conditions.push(eq(article.feedId, feedId));
    }
    if (unread === true) {
      conditions.push(eq(article.isRead, false));
    }
    if (unread === false) {
      conditions.push(eq(article.isRead, true));
    }
    if (categoryId === UNCATEGORIZED_PARAM) {
      conditions.push(isNull(feed.categoryId));
    } else if (categoryId) {
      conditions.push(eq(feed.categoryId, categoryId));
    }

    const baseQuery = db
      .select({
        id: article.id,
        userId: article.userId,
        feedId: article.feedId,
        url: article.url,
        title: article.title,
        description: article.description,
        ogImageUrl: article.ogImageUrl,
        isRead: article.isRead,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      })
      .from(article);

    const rows = categoryId
      ? await baseQuery
          .innerJoin(feed, eq(article.feedId, feed.id))
          .where(and(...conditions))
          .orderBy(desc(article.publishedAt), desc(article.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset)
      : await baseQuery
          .where(and(...conditions))
          .orderBy(desc(article.publishedAt), desc(article.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset);

    const totalRow = categoryId
      ? await db
          .select({ value: count() })
          .from(article)
          .innerJoin(feed, eq(article.feedId, feed.id))
          .where(and(...conditions))
          .get()
      : await db
          .select({ value: count() })
          .from(article)
          .where(and(...conditions))
          .get();
    const total = totalRow?.value ?? 0;

    return c.json({
      items: rows,
      total,
      page,
      perPage: PAGE_SIZE,
    });
  })
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
      const { isRead } = c.req.valid("json");
      const existing = await db
        .select({ id: article.id })
        .from(article)
        .where(and(eq(article.id, id), eq(article.userId, user.id)))
        .get();
      if (!existing) {
        return c.json({ error: "Not Found" }, 404);
      }
      await db.update(article).set({ isRead }).where(eq(article.id, id));
      const updated = await db
        .select()
        .from(article)
        .where(eq(article.id, id))
        .get();
      return c.json(updated);
    },
  );
