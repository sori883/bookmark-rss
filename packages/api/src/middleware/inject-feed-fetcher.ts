import { createMiddleware } from "hono/factory";

import type { AppEnv, FeedFetcher } from "../env";

export const injectFeedFetcher = (fetcher: FeedFetcher) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("feedFetcher", fetcher);
    await next();
  });
