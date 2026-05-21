import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../env";

export const injectEncryptionKey = (masterKey: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set("encryptionMasterKey", masterKey);
    await next();
  });
