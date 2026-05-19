import { createMiddleware } from "hono/factory";

import type { Auth } from "@acme/auth";

import type { AppEnv } from "../env";

export const loadSession = (auth: Auth) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });
