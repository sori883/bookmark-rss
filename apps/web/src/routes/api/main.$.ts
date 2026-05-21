import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import {
  createApp,
  createDefaultArticleFetcher,
  createDefaultFeedFetcher,
  createDefaultOgFetcher,
} from "@acme/api";

import { auth } from "~/auth/server";
import { dbClient } from "~/lib/db-client";
import { jobsDispatcher } from "~/lib/jobs-dispatcher";

const app = createApp({
  auth,
  db: dbClient(),
  feedFetcher: createDefaultFeedFetcher(),
  ogFetcher: createDefaultOgFetcher(),
  articleFetcher: createDefaultArticleFetcher(),
  jobsDispatcher,
  encryptionMasterKey: env.ENCRYPTION_MASTER_KEY,
});

export const Route = createFileRoute("/api/main/$")({
  server: {
    handlers: {
      GET: ({ request }) => app.fetch(request),
      POST: ({ request }) => app.fetch(request),
      PUT: ({ request }) => app.fetch(request),
      DELETE: ({ request }) => app.fetch(request),
      PATCH: ({ request }) => app.fetch(request),
    },
  },
});
