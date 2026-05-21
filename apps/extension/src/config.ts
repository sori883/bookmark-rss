const fallbackBaseUrl = "http://localhost:3000";

const readEnv = (key: string): string | undefined => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key];
};

export const BASE_URL =
  readEnv("VITE_API_BASE_URL")?.trim().replace(/\/+$/, "") ?? fallbackBaseUrl;

export const CLIENT_ID = "bookmark-extension";
