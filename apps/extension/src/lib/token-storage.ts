import { browser } from "wxt/browser";

const STORAGE_KEY = "bookmarkRss.tokenData";

export interface TokenData {
  token: string;
  expiryTime: number;
}

const isTokenData = (value: unknown): value is TokenData =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { token?: unknown }).token === "string" &&
  typeof (value as { expiryTime?: unknown }).expiryTime === "number";

export const getTokenData = async (): Promise<TokenData | null> => {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const value: unknown = result[STORAGE_KEY];
  return isTokenData(value) ? value : null;
};

export const getToken = async (): Promise<string | null> => {
  const data = await getTokenData();
  if (!data) {
    return null;
  }
  if (Date.now() >= data.expiryTime) {
    return null;
  }
  return data.token;
};

export const isTokenExpired = async (): Promise<boolean> => {
  const data = await getTokenData();
  if (!data) {
    return true;
  }
  return Date.now() >= data.expiryTime;
};

export const saveToken = async (
  token: string,
  expiresIn: number,
): Promise<void> => {
  const expiryTime = Date.now() + expiresIn * 1000;
  await browser.storage.local.set({ [STORAGE_KEY]: { token, expiryTime } });
};

export const clearToken = async (): Promise<void> => {
  await browser.storage.local.remove(STORAGE_KEY);
};
