import { createMiddleware } from "hono/factory";

import type { AppEnv, JobsDispatcher } from "../env";

export const injectJobsDispatcher = (dispatcher: JobsDispatcher) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("jobsDispatcher", dispatcher);
    await next();
  });
