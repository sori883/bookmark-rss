import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { category, feed } from "@acme/db/schema";

import type { AppEnv } from "../env";

const nameSchema = z.object({
  name: z.string().min(1).max(100),
});

export const categoriesRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const rows = await db
      .select()
      .from(category)
      .where(eq(category.userId, user.id))
      .orderBy(asc(category.name));
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
        .select({ id: category.id })
        .from(category)
        .where(and(eq(category.userId, user.id), eq(category.name, name)))
        .get();
      if (existing) {
        return c.json({ error: "Category name already used" }, 409);
      }
      const id = randomUUID();
      await db.insert(category).values({ id, userId: user.id, name });
      const created = await db
        .select()
        .from(category)
        .where(eq(category.id, id))
        .get();
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
        .select({ id: category.id })
        .from(category)
        .where(and(eq(category.id, id), eq(category.userId, user.id)))
        .get();
      if (!owned) {
        return c.json({ error: "Not Found" }, 404);
      }
      const conflict = await db
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.userId, user.id),
            eq(category.name, name),
            ne(category.id, id),
          ),
        )
        .get();
      if (conflict) {
        return c.json({ error: "Category name already used" }, 409);
      }
      await db.update(category).set({ name }).where(eq(category.id, id));
      const updated = await db
        .select()
        .from(category)
        .where(eq(category.id, id))
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
    const owned = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, id), eq(category.userId, user.id)))
      .get();
    if (!owned) {
      return c.json({ error: "Not Found" }, 404);
    }
    // SQLite's ALTER TABLE ADD COLUMN doesn't preserve ON DELETE SET NULL,
    // so unassign feeds explicitly before dropping the category row.
    await db
      .update(feed)
      .set({ categoryId: null })
      .where(eq(feed.categoryId, id));
    await db.delete(category).where(eq(category.id, id));
    return c.body(null, 204);
  });
