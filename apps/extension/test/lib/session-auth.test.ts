import { describe, expect, it, vi } from "vitest";

import { trySessionAuth } from "../../src/lib/session-auth";
import { getToken, getTokenData } from "../../src/lib/token-storage";

const okWithJwt = (jwt: string) =>
  new Response(JSON.stringify({ session: { id: "s1" } }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-auth-jwt": jwt,
    },
  });

const okWithoutJwt = () =>
  new Response(JSON.stringify({ session: { id: "s1" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const unauthorized = () =>
  new Response("null", {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("trySessionAuth", () => {
  it("calls /api/auth/get-session with credentials: include", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okWithJwt("jwt-1"));

    await trySessionAuth({ authBaseUrl: "https://api.example.com" }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/api/auth/get-session",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("saves the JWT and returns true on success", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okWithJwt("jwt-2"));

    const result = await trySessionAuth(
      { authBaseUrl: "https://api.example.com", expiresIn: 900 },
      fetchImpl,
    );

    expect(result).toBe(true);
    expect(await getToken()).toBe("jwt-2");
  });

  it("uses the provided expiresIn when persisting the token", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(okWithJwt("jwt-3"));

      await trySessionAuth(
        { authBaseUrl: "https://api.example.com", expiresIn: 120 },
        fetchImpl,
      );

      expect(await getTokenData()).toEqual({
        token: "jwt-3",
        expiryTime: 1_000_000 + 120 * 1000,
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("returns false and does not save when the response has no set-auth-jwt header", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okWithoutJwt());

    const result = await trySessionAuth(
      { authBaseUrl: "https://api.example.com" },
      fetchImpl,
    );

    expect(result).toBe(false);
    expect(await getToken()).toBeNull();
  });

  it("returns false when the user is not logged in (null session)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(unauthorized());

    const result = await trySessionAuth(
      { authBaseUrl: "https://api.example.com" },
      fetchImpl,
    );

    expect(result).toBe(false);
    expect(await getToken()).toBeNull();
  });

  it("returns false when fetch throws (e.g. network error)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network down"));

    const result = await trySessionAuth(
      { authBaseUrl: "https://api.example.com" },
      fetchImpl,
    );

    expect(result).toBe(false);
  });

  it("returns false on a non-2xx response (e.g. 500)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("oops", { status: 500 }));

    const result = await trySessionAuth(
      { authBaseUrl: "https://api.example.com" },
      fetchImpl,
    );

    expect(result).toBe(false);
  });

  it("strips trailing slashes from the baseUrl", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okWithJwt("jwt"));

    await trySessionAuth(
      { authBaseUrl: "https://api.example.com/" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/api/auth/get-session",
      expect.anything(),
    );
  });
});
