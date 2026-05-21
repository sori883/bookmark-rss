import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import {
  createApp,
  createDefaultArticleFetcher,
  createDefaultFeedFetcher,
  createDefaultOgFetcher,
} from "@acme/api";
import { createApiClient } from "@acme/api/client";

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

export const apiFetch = createIsomorphicFn()
  .server(() => (input: RequestInfo | URL, init?: RequestInit) => {
    const req = getRequest();
    const cookie = req.headers.get("cookie") ?? "";
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("cookie", cookie);
    return Promise.resolve(app.fetch(new Request(input, { ...init, headers })));
  })
  .client(
    () => (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, credentials: "same-origin" }),
  );

const baseUrl = () =>
  typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const makeApiClient = () =>
  createApiClient(baseUrl(), { fetch: apiFetch() });
