import { createMiddleware } from "hono/factory";

import type { AppEnv, OgFetcher } from "../env";

export const injectOgFetcher = (fetcher: OgFetcher) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("ogFetcher", fetcher);
    await next();
  });
