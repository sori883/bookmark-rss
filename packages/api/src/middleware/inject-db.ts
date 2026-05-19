import { createMiddleware } from "hono/factory";

import type { DbType } from "@acme/db/client";

import type { AppEnv } from "../env";

export const injectDb = (db: DbType) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("db", db);
    await next();
  });
