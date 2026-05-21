import { describe, expect, it, vi } from "vitest";

import {
  clearToken,
  getToken,
  getTokenData,
  isTokenExpired,
  saveToken,
} from "../../src/lib/token-storage";

describe("token-storage", () => {
  describe("getToken", () => {
    it("returns null when no token is stored", async () => {
      expect(await getToken()).toBeNull();
    });

    it("returns the stored token when not expired", async () => {
      await saveToken("tok-1", 3600);
      expect(await getToken()).toBe("tok-1");
    });

    it("returns null when the token has expired", async () => {
      const realNow = Date.now;
      try {
        vi.spyOn(Date, "now").mockReturnValue(0);
        await saveToken("tok-1", 60);
        vi.spyOn(Date, "now").mockReturnValue(61 * 1000);
        expect(await getToken()).toBeNull();
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe("getTokenData", () => {
    it("returns null when nothing is stored", async () => {
      expect(await getTokenData()).toBeNull();
    });

    it("returns the token with its expiry time", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      try {
        await saveToken("tok-2", 60);
        expect(await getTokenData()).toEqual({
          token: "tok-2",
          expiryTime: 1_000_000 + 60 * 1000,
        });
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("isTokenExpired", () => {
    it("is true when no token is stored", async () => {
      expect(await isTokenExpired()).toBe(true);
    });

    it("is false when within the validity window", async () => {
      await saveToken("tok", 3600);
      expect(await isTokenExpired()).toBe(false);
    });

    it("is true once past the expiry time", async () => {
      const realNow = Date.now;
      try {
        vi.spyOn(Date, "now").mockReturnValue(0);
        await saveToken("tok", 60);
        vi.spyOn(Date, "now").mockReturnValue(60 * 1000 + 1);
        expect(await isTokenExpired()).toBe(true);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe("saveToken", () => {
    it("overwrites the previous token", async () => {
      await saveToken("tok-1", 60);
      await saveToken("tok-2", 60);
      expect(await getToken()).toBe("tok-2");
    });
  });

  describe("clearToken", () => {
    it("removes a previously stored token", async () => {
      await saveToken("tok-1", 60);
      await clearToken();
      expect(await getToken()).toBeNull();
      expect(await getTokenData()).toBeNull();
    });

    it("is a no-op when no token is stored", async () => {
      await clearToken();
      expect(await getToken()).toBeNull();
    });
  });
});
