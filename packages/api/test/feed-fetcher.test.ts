import { describe, expect, it } from "vitest";

import { createDefaultFeedFetcher } from "../src/services/feed-fetcher";

const rss2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>desc</description>
    <item>
      <title>First Item</title>
      <link>https://example.com/1</link>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <link href="https://atom.example.com" />
  <link rel="self" href="https://atom.example.com/feed.xml" />
  <entry><title>Entry</title></entry>
</feed>`;

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
        headers: { "content-type": r.contentType ?? "application/xml" },
      }),
    );
  };
  return fn;
};

describe("defaultFeedFetcher: direct fetch", () => {
  it("parses RSS 2.0 when the URL points to a feed", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({ "https://example.com/rss": { body: rss2 } }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com/rss");
    expect(meta).toEqual({
      title: "Example RSS Feed",
      siteUrl: "https://example.com",
      feedUrl: "https://example.com/rss",
    });
  });

  it("parses Atom feed and skips rel=self link", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://atom.example.com/feed.xml": { body: atom },
      }),
    });
    const meta = await fetcher.fetchMetadata(
      "https://atom.example.com/feed.xml",
    );
    expect(meta).toEqual({
      title: "Example Atom Feed",
      siteUrl: "https://atom.example.com",
      feedUrl: "https://atom.example.com/feed.xml",
    });
  });
});

describe("defaultFeedFetcher: HTML discovery", () => {
  it("follows <link rel=alternate type=application/rss+xml> from HTML page", async () => {
    const html = `<!doctype html>
<html><head>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="RSS">
</head><body></body></html>`;
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html, contentType: "text/html" },
        "https://example.com/feed.xml": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com");
    expect(meta.feedUrl).toBe("https://example.com/feed.xml");
    expect(meta.title).toBe("Example RSS Feed");
  });

  it("follows <link rel=alternate type=application/atom+xml>", async () => {
    const html = `<html><head>
  <link rel="alternate" type="application/atom+xml" href="https://atom.example.com/feed.xml">
</head></html>`;
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://atom.example.com": { body: html, contentType: "text/html" },
        "https://atom.example.com/feed.xml": { body: atom },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://atom.example.com");
    expect(meta.feedUrl).toBe("https://atom.example.com/feed.xml");
  });

  it("uses the first alternate link when multiple are present", async () => {
    const html = `<html><head>
  <link rel="alternate" type="application/rss+xml" href="/primary.xml">
  <link rel="alternate" type="application/atom+xml" href="/secondary.xml">
</head></html>`;
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": { body: html, contentType: "text/html" },
        "https://example.com/primary.xml": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com");
    expect(meta.feedUrl).toBe("https://example.com/primary.xml");
  });

  it("resolves relative hrefs against the input URL", async () => {
    const html = `<html><head>
  <link rel="alternate" type="application/rss+xml" href="rss">
</head></html>`;
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/blog/": {
          body: html,
          contentType: "text/html",
        },
        "https://example.com/blog/rss": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com/blog/");
    expect(meta.feedUrl).toBe("https://example.com/blog/rss");
  });
});

describe("defaultFeedFetcher: suffix fallback", () => {
  it("tries /feed when input HTML has no alternate link", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": {
          body: "<html><head></head></html>",
          contentType: "text/html",
        },
        "https://example.com/feed": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com");
    expect(meta.feedUrl).toBe("https://example.com/feed");
  });

  it("falls back to /feed.xml after /feed 404s", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": {
          body: "<html></html>",
          contentType: "text/html",
        },
        "https://example.com/feed.xml": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com");
    expect(meta.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("tries suffixes appended to the input path before the origin", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/blog": {
          body: "<html></html>",
          contentType: "text/html",
        },
        "https://example.com/blog/feed": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com/blog");
    expect(meta.feedUrl).toBe("https://example.com/blog/feed");
  });

  it("falls back to origin-level suffixes if path-level fails", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com/blog": {
          body: "<html></html>",
          contentType: "text/html",
        },
        "https://example.com/feed": { body: rss2 },
      }),
    });
    const meta = await fetcher.fetchMetadata("https://example.com/blog");
    expect(meta.feedUrl).toBe("https://example.com/feed");
  });
});

describe("defaultFeedFetcher: failure", () => {
  it("throws when input 404s and all suffix attempts 404 too", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({}),
    });
    await expect(
      fetcher.fetchMetadata("https://example.com/rss"),
    ).rejects.toThrow();
  });

  it("throws when input is HTML with no link and suffixes 404", async () => {
    const fetcher = createDefaultFeedFetcher({
      fetchImpl: createFetchMock({
        "https://example.com": {
          body: "<html><body>nothing here</body></html>",
          contentType: "text/html",
        },
      }),
    });
    await expect(
      fetcher.fetchMetadata("https://example.com"),
    ).rejects.toThrow();
  });
});
