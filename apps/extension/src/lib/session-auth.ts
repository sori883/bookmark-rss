import { saveToken } from "./token-storage";

export interface TrySessionAuthParams {
  authBaseUrl: string;
  expiresIn?: number;
}

const DEFAULT_EXPIRES_IN = 900;

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export const trySessionAuth = async (
  { authBaseUrl, expiresIn = DEFAULT_EXPIRES_IN }: TrySessionAuthParams,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    const res = await fetchImpl(
      `${stripTrailingSlash(authBaseUrl)}/api/auth/get-session`,
      { credentials: "include" },
    );
    if (!res.ok) {
      return false;
    }
    const jwt = res.headers.get("set-auth-jwt");
    if (!jwt) {
      return false;
    }
    await saveToken(jwt, expiresIn);
    return true;
  } catch {
    return false;
  }
};
