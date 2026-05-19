import { env } from "cloudflare:workers";

import { initAuth } from "@acme/auth";
import { tanstackStartCookies } from "@acme/auth/tanstack-start";

import { dbClient } from "~/lib/db-client";

export const auth = initAuth({
  db: dbClient(),
  authUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedUrl: env.BETTER_TRUSTED_URL,
  googleClientId: env.AUTH_GOOGLE_ID,
  googleClientSecret: env.AUTH_GOOGLE_SECRET,
  extraPlugins: [tanstackStartCookies()],
});
