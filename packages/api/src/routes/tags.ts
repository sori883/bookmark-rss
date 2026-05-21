import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { bookmarkTag, tag } from "@acme/db/schema";

import type { AppEnv } from "../env";

const nameSchema = z.object({
  name: z.string().min(1).max(100),
});

export const tagsRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const rows = await db
      .select()
      .from(tag)
      .where(eq(tag.userId, user.id))
      .orderBy(asc(tag.name));
    return c.json(rows);
  })
  .post(
    "/",
    zValidator("json", nameSchema, (result, c) => {
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
      const { name } = c.req.valid("json");
      const existing = await db
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.userId, user.id), eq(tag.name, name)))
        .get();
      if (existing) {
        return c.json({ error: "Tag name already used" }, 409);
      }
      const id = randomUUID();
      await db.insert(tag).values({ id, userId: user.id, name });
      const created = await db.select().from(tag).where(eq(tag.id, id)).get();
      return c.json(created, 201);
    },
  )
  .patch(
    "/:id",
    zValidator("json", nameSchema, (result, c) => {
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
      const { name } = c.req.valid("json");
      const owned = await db
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.id, id), eq(tag.userId, user.id)))
        .get();
      if (!owned) {
        return c.json({ error: "Not Found" }, 404);
      }
      const conflict = await db
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.userId, user.id), eq(tag.name, name), ne(tag.id, id)))
        .get();
      if (conflict) {
        return c.json({ error: "Tag name already used" }, 409);
      }
      await db.update(tag).set({ name }).where(eq(tag.id, id));
      const updated = await db.select().from(tag).where(eq(tag.id, id)).get();
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
    const owned = await db
      .select({ id: tag.id })
      .from(tag)
      .where(and(eq(tag.id, id), eq(tag.userId, user.id)))
      .get();
    if (!owned) {
      return c.json({ error: "Not Found" }, 404);
    }
    // SQLite ALTER doesn't preserve ON DELETE CASCADE for new FKs; clear
    // junction rows explicitly to keep behavior consistent.
    await db.delete(bookmarkTag).where(eq(bookmarkTag.tagId, id));
    await db.delete(tag).where(eq(tag.id, id));
    return c.body(null, 204);
  });
