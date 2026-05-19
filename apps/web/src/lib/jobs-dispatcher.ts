import { env } from "cloudflare:workers";

import type { JobsDispatcher } from "@acme/api";

/**
 * Sends ingest requests to the worker-jobs service via Cloudflare Service
 * Binding. The bound worker accepts the request, kicks off the actual work
 * in `executionCtx.waitUntil`, and returns 202 immediately — so the calling
 * route stays fast even for large OPML imports.
 */
export const jobsDispatcher: JobsDispatcher = {
  async triggerFeedIngest(feedIds) {
    if (feedIds.length === 0) return;
    const res = await env.JOBS.fetch("https://jobs.internal/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedIds }),
    });
    if (!res.ok) {
      throw new Error(`jobs dispatch failed: ${res.status}`);
    }
  },
  async triggerBookmarkExtract(bookmarkIds) {
    if (bookmarkIds.length === 0) return;
    const res = await env.JOBS.fetch("https://jobs.internal/extract-bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookmarkIds }),
    });
    if (!res.ok) {
      throw new Error(`jobs dispatch failed: ${res.status}`);
    }
  },
};
