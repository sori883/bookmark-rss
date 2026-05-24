import { describe, expect, it, vi } from "vitest";

import { addBookmark } from "../../src/lib/bookmark-client";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("addBookmark", () => {
  it("posts the URL to /api/main/bookmarks with the bearer token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: "b1",
        url: "https://example.com",
        title: "Example",
      }),
    );

    await addBookmark(
      {
        baseUrl: "https://api.example.com",
        token: "tok-1",
        url: "https://example.com",
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/api/main/bookmarks",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ url: "https://example.com" }),
      },
    );
  });

  it("strips trailing slashes from the baseUrl", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(201, { id: "b1" }));

    await addBookmark(
      { baseUrl: "https://api.example.com/", token: "t", url: "https://x" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/api/main/bookmarks",
      expect.anything(),
    );
  });

  it("returns ok with the created bookmark on 201", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        id: "b1",
        url: "https://example.com",
        title: "Example",
      }),
    );

    const result = await addBookmark(
      {
        baseUrl: "https://api.example.com",
        token: "t",
        url: "https://example.com",
      },
      fetchImpl,
    );

    expect(result).toEqual({
      ok: true,
      bookmark: {
        id: "b1",
        url: "https://example.com",
        title: "Example",
      },
    });
  });

  it("returns unauthorized on 401", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

    const result = await addBookmark(
      { baseUrl: "https://api.example.com", token: "t", url: "https://x" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("returns already-exists on 409", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(409, { error: "Bookmark already exists" }),
      );

    const result = await addBookmark(
      { baseUrl: "https://api.example.com", token: "t", url: "https://x" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, reason: "already-exists" });
  });

  it("returns fetch-failed on 422", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(422, { error: "Could not fetch the page" }),
      );

    const result = await addBookmark(
      { baseUrl: "https://api.example.com", token: "t", url: "https://x" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("returns unknown with status code on other failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("oops", { status: 500 }));

    const result = await addBookmark(
      { baseUrl: "https://api.example.com", token: "t", url: "https://x" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, reason: "unknown", status: 500 });
  });
});
