import { env } from "cloudflare:workers";

import { createDbClient } from "@acme/db/client";

export const dbClient = () =>
  createDbClient({
    url: env.DATABASE_URL,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN,
  });
