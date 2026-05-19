import { describe, expect, it } from "vitest";

import { createDefaultArticleFetcher } from "../src/article-fetcher";

const makeFetchOk =
  (body: string, contentType = "application/xml"): typeof fetch =>
  () =>
    Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { "content-type": contentType },
      }),
    );

describe("defaultArticleFetcher: RSS 2.0", () => {
  it("extracts items with title, url, description, publishedAt", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Channel</title>
    <link>https://example.com</link>
    <item>
      <title>Item One</title>
      <link>https://example.com/1</link>
      <description>First post</description>
      <pubDate>Mon, 19 May 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Item Two</title>
      <link>https://example.com/2</link>
    </item>
  </channel>
</rss>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(rss),
    });
    const articles = await fetcher.fetchArticles("https://example.com/rss");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({
      url: "https://example.com/1",
      title: "Item One",
      description: "First post",
      ogImageUrl: null,
      publishedAt: new Date("2026-05-19T12:00:00Z"),
    });
    expect(articles[1]).toEqual({
      url: "https://example.com/2",
      title: "Item Two",
      description: null,
      ogImageUrl: null,
      publishedAt: null,
    });
  });

  it("uses enclosure or media:thumbnail for ogImageUrl when present", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <item>
      <title>With enclosure</title>
      <link>https://example.com/1</link>
      <enclosure url="https://cdn.example.com/img.jpg" type="image/jpeg" length="1000"/>
    </item>
    <item>
      <title>With media:thumbnail</title>
      <link>https://example.com/2</link>
      <media:thumbnail url="https://cdn.example.com/thumb.png"/>
    </item>
  </channel>
</rss>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(rss),
    });
    const articles = await fetcher.fetchArticles("https://example.com/rss");
    expect(articles[0]?.ogImageUrl).toBe("https://cdn.example.com/img.jpg");
    expect(articles[1]?.ogImageUrl).toBe("https://cdn.example.com/thumb.png");
  });

  it("skips items missing both link and guid", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>No URL</title>
    </item>
    <item>
      <title>OK</title>
      <link>https://example.com/ok</link>
    </item>
  </channel>
</rss>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(rss),
    });
    const articles = await fetcher.fetchArticles("https://example.com/rss");
    expect(articles.map((a) => a.url)).toEqual(["https://example.com/ok"]);
  });

  it('falls back to <guid isPermaLink="true"> when <link> is missing', async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Using guid</title>
      <guid isPermaLink="true">https://example.com/guid-item</guid>
    </item>
  </channel>
</rss>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(rss),
    });
    const articles = await fetcher.fetchArticles("https://example.com/rss");
    expect(articles[0]?.url).toBe("https://example.com/guid-item");
  });
});

describe("defaultArticleFetcher: Atom", () => {
  it("extracts entries with title, link, summary, published", async () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://atom.example.com/1"/>
    <summary>An entry</summary>
    <published>2026-05-19T08:30:00Z</published>
  </entry>
</feed>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(atom),
    });
    const articles = await fetcher.fetchArticles(
      "https://atom.example.com/feed.xml",
    );
    expect(articles[0]).toEqual({
      url: "https://atom.example.com/1",
      title: "Atom Entry One",
      description: "An entry",
      ogImageUrl: null,
      publishedAt: new Date("2026-05-19T08:30:00Z"),
    });
  });

  it("prefers link with rel=alternate over rel=self", async () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Entry</title>
    <link rel="self" href="https://atom.example.com/feed/1"/>
    <link rel="alternate" href="https://atom.example.com/post/1"/>
  </entry>
</feed>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(atom),
    });
    const articles = await fetcher.fetchArticles(
      "https://atom.example.com/feed.xml",
    );
    expect(articles[0]?.url).toBe("https://atom.example.com/post/1");
  });

  it("uses updated as fallback for publishedAt", async () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Entry</title>
    <link href="https://atom.example.com/1"/>
    <updated>2026-05-19T05:00:00Z</updated>
  </entry>
</feed>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(atom),
    });
    const articles = await fetcher.fetchArticles(
      "https://atom.example.com/feed.xml",
    );
    expect(articles[0]?.publishedAt).toEqual(new Date("2026-05-19T05:00:00Z"));
  });

  it("uses content as fallback for description when summary is missing", async () => {
    const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Entry</title>
    <link href="https://atom.example.com/1"/>
    <content>Full content here</content>
  </entry>
</feed>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(atom),
    });
    const articles = await fetcher.fetchArticles(
      "https://atom.example.com/feed.xml",
    );
    expect(articles[0]?.description).toBe("Full content here");
  });
});

describe("defaultArticleFetcher: error cases", () => {
  it("throws when fetch fails", async () => {
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: () => Promise.resolve(new Response("", { status: 500 })),
    });
    await expect(
      fetcher.fetchArticles("https://example.com/rss"),
    ).rejects.toThrow();
  });

  it("returns empty array when feed has no items", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk(rss),
    });
    expect(await fetcher.fetchArticles("https://example.com/rss")).toEqual([]);
  });

  it("throws when body is not a recognizable feed", async () => {
    const fetcher = createDefaultArticleFetcher({
      fetchImpl: makeFetchOk("<html><body>not a feed</body></html>"),
    });
    await expect(
      fetcher.fetchArticles("https://example.com"),
    ).rejects.toThrow();
  });
});
