import { describe, expect, it, vi } from "vitest";

import {
  DeviceFlowError,
  pollDeviceToken,
  requestDeviceCode,
} from "../../src/lib/device-flow.ts";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const errorJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 400,
    headers: { "content-type": "application/json" },
  });

describe("requestDeviceCode", () => {
  it("calls /api/auth/device/code and returns the parsed payload", async () => {
    const payload = {
      device_code: "dev-1",
      user_code: "ABCD-EFGH",
      verification_uri: "https://example.com/device",
      verification_uri_complete:
        "https://example.com/device?user_code=ABCD-EFGH",
      expires_in: 600,
      interval: 5,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okJson(payload));
    const result = await requestDeviceCode(
      "https://example.com",
      "cli",
      fetchImpl,
    );
    expect(result).toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/api/auth/device/code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ client_id: "cli" }),
      }),
    );
  });

  it("strips trailing slashes from the baseUrl", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      okJson({
        device_code: "x",
        user_code: "y",
        verification_uri: "z",
        verification_uri_complete: "z?",
        expires_in: 1,
        interval: 1,
      }),
    );
    await requestDeviceCode("https://example.com/", "cli", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/api/auth/device/code",
      expect.anything(),
    );
  });

  it("throws DeviceFlowError on non-200 responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("server is down", { status: 500 }));
    await expect(
      requestDeviceCode("https://example.com", "cli", fetchImpl),
    ).rejects.toThrow(DeviceFlowError);
  });
});

describe("pollDeviceToken", () => {
  it("returns the access token on success", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      okJson({
        access_token: "tok",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "",
      }),
    );
    const result = await pollDeviceToken(
      "https://example.com",
      "cli",
      "dev-code",
      fetchImpl,
    );
    expect(result).toEqual({
      access_token: "tok",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "",
    });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/api/auth/device/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: "dev-code",
          client_id: "cli",
        }),
      }),
    );
  });

  it.each([
    "authorization_pending",
    "slow_down",
    "expired_token",
    "access_denied",
    "invalid_grant",
  ])("returns the error code for %s", async (error) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorJson({ error, error_description: "..." }));
    const result = await pollDeviceToken(
      "https://example.com",
      "cli",
      "dev-code",
      fetchImpl,
    );
    expect(result).toEqual({ error });
  });

  it("throws on unexpected 5xx responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("oops", { status: 502 }));
    await expect(
      pollDeviceToken("https://example.com", "cli", "dev-code", fetchImpl),
    ).rejects.toThrow(DeviceFlowError);
  });
});
