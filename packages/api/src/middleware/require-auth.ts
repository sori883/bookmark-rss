import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../env";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
