import { createDbNodeClient } from "@acme/db/client";

import { initAuth } from "../src";

/**
 * generate auth-schema.ts
 */
export const auth = initAuth({
  db: createDbNodeClient({
    url: process.env.DATABASE_URL!,
    databaseAuthToken: process.env.DATABASE_AUTH_TOKEN!,
  }),
  authUrl: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedUrl: process.env.BETTER_TRUSTED_URL!,
  googleClientId: process.env.AUTH_GOOGLE_ID!,
  googleClientSecret: process.env.AUTH_GOOGLE_SECRET!,
});
