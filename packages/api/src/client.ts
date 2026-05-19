import { hc } from "hono/client";

import type { AppType } from "./index";

export const createApiClient = (
  baseUrl: string,
  options?: Parameters<typeof hc<AppType>>[1],
) => hc<AppType>(baseUrl, options);

export type ApiClient = ReturnType<typeof createApiClient>;
