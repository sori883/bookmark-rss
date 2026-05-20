import { createApiClient } from "@acme/api/client";

import type { CliConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { getBaseUrl } from "./env.ts";

export class NotLoggedInError extends Error {
  constructor() {
    super("Not logged in. Run `bookmark login` first.");
    this.name = "NotLoggedInError";
  }
}

export const createCliClient = (token: string) =>
  createApiClient(getBaseUrl(), {
    headers: { Authorization: `Bearer ${token}` },
  });

export const requireAuthedClient = async () => {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new NotLoggedInError();
  }
  return { client: createCliClient(cfg.token), config: cfg };
};

// Fallback for routes where Hono RPC type inference collapses to `never`
// under deeply-chained routers. Used by bookmark delete.
export const cliRawRequest = async (
  cfg: CliConfig,
  method: string,
  path: string,
  body?: unknown,
) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const base = getBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};
