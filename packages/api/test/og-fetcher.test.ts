import { describe, expect, it } from "vitest";

import { createDefaultOgFetcher } from "../src/services/og-fetcher";

interface MockResponse {
  body: string;
  status?: number;
  contentType?: string;
}

const createFetchMock = (
  responses: Record<string, MockResponse>,
): typeof fetch => {
  const fn: typeof fetch = (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const r = responses[url];
    if (!r) {
      return Promise.resolve(new Response("", { status: 404 }));
    }
    return Promise.resolve(
      new Response(r.body, {
        status: r.status ?? 200,
        headers: { "content-type": r.contentType ?? "text/html" },
      }),
    );
  };
  return fn;
};

describe("defaultOgFetcher", () => {
  it("extracts og:title, og:description, og:image", async () => {
    const html = `<!doctype html>
<html><head>
  <meta property="og:title" content="Page Title">
  <meta property="og:description" content="Page description">
  <meta property="og:image" content="https://cdn.example.com/img.png">
</head><body></body></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/article": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com/article");
    expect(meta).toEqual({
      title: "Page Title",
      description: "Page description",
      imageUrl: "https://cdn.example.com/img.png",
    });
  });

  it("resolves relative og:image against the page URL", async () => {
    const html = `<html><head>
  <meta property="og:title" content="X">
  <meta property="og:image" content="/img.png">
</head></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/post/": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com/post/");
    expect(meta.imageUrl).toBe("https://example.com/img.png");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = `<html><head>
  <title>Fallback Title</title>
</head></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com");
    expect(meta.title).toBe("Fallback Title");
  });

  it("falls back to URL when there's no title at all", async () => {
    const html = "<html><head></head></html>";
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/a": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com/a");
    expect(meta.title).toBe("https://example.com/a");
  });

  it("returns null description/image when not present", async () => {
    const html = `<html><head>
  <meta property="og:title" content="Only Title">
</head></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com");
    expect(meta).toEqual({
      title: "Only Title",
      description: null,
      imageUrl: null,
    });
  });

  it("handles meta tags in any attribute order with single quotes", async () => {
    const html = `<html><head>
  <meta content='Quote Title' property='og:title'>
</head></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com");
    expect(meta.title).toBe("Quote Title");
  });

  it("decodes basic HTML entities in attributes", async () => {
    const html = `<html><head>
  <meta property="og:title" content="A &amp; B &lt;tag&gt;">
</head></html>`;
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html },
      }),
    });
    const meta = await fetcher.fetch("https://example.com");
    expect(meta.title).toBe("A & B <tag>");
  });

  it("throws when fetch returns non-2xx", async () => {
    const fetcher = createDefaultOgFetcher({
      fetchImpl: createFetchMock({}),
    });
    await expect(
      fetcher.fetch("https://example.com/missing"),
    ).rejects.toThrow();
  });

  it("sends a browser-style User-Agent so CDN-protected pages succeed", async () => {
    let captured: Headers | undefined;
    const fetchImpl: typeof fetch = (_input, init) => {
      captured = new Headers(init?.headers);
      return Promise.resolve(new Response("<html></html>", { status: 200 }));
    };
    const fetcher = createDefaultOgFetcher({ fetchImpl });
    await fetcher.fetch("https://example.com");
    expect(captured?.get("user-agent")).toMatch(/^Mozilla\//);
  });
});
