import { createMiddleware } from "hono/factory";

import type { ArticleFetcher } from "@acme/jobs";

import type { AppEnv } from "../env";

export const injectArticleFetcher = (fetcher: ArticleFetcher) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("articleFetcher", fetcher);
    await next();
  });
