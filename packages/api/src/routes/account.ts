import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import {
  account,
  article,
  bookmark,
  bookmarkTag,
  category,
  deviceCode,
  feed,
  recommendation,
  recommendationItem,
  session,
  tag,
  user,
  userPreference,
} from "@acme/db/schema";

import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/require-auth";

export const accountRouter = new Hono<AppEnv>().delete(
  "/",
  requireAuth,
  async (c) => {
    const currentUser = c.get("user");
    if (!currentUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const uid = currentUser.id;

    const recIds = (
      await db
        .select({ id: recommendation.id })
        .from(recommendation)
        .where(eq(recommendation.userId, uid))
    ).map((r) => r.id);
    const bookmarkIds = (
      await db
        .select({ id: bookmark.id })
        .from(bookmark)
        .where(eq(bookmark.userId, uid))
    ).map((b) => b.id);

    if (recIds.length > 0) {
      await db
        .delete(recommendationItem)
        .where(inArray(recommendationItem.recommendationId, recIds));
    }
    if (bookmarkIds.length > 0) {
      await db
        .delete(bookmarkTag)
        .where(inArray(bookmarkTag.bookmarkId, bookmarkIds));
    }
    await db.delete(recommendation).where(eq(recommendation.userId, uid));
    await db.delete(bookmark).where(eq(bookmark.userId, uid));
    await db.delete(article).where(eq(article.userId, uid));
    await db.delete(feed).where(eq(feed.userId, uid));
    await db.delete(category).where(eq(category.userId, uid));
    await db.delete(tag).where(eq(tag.userId, uid));
    await db.delete(userPreference).where(eq(userPreference.userId, uid));
    await db.delete(deviceCode).where(eq(deviceCode.userId, uid));
    await db.delete(session).where(eq(session.userId, uid));
    await db.delete(account).where(eq(account.userId, uid));
    await db.delete(user).where(eq(user.id, uid));

    return c.json({ deleted: true });
  },
);
