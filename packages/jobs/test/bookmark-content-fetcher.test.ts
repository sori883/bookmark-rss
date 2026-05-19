import { describe, expect, it } from "vitest";

import { createDefaultBookmarkContentFetcher } from "../src/bookmark-content-fetcher";

const articleHtml = `<!doctype html>
<html><head><title>Sample Post</title></head>
<body><article>
  <h1>Sample Post</h1>
  <p>This is the first paragraph of a sample post with enough text to satisfy Readability heuristics for article extraction.</p>
  <p>Here is some additional content to ensure the algorithm recognizes this as the main article body.</p>
</article></body></html>`;

const makeFetchOk = (body: string, contentType = "text/html"): typeof fetch =>
  () =>
    Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { "content-type": contentType },
      }),
    );

describe("defaultBookmarkContentFetcher", () => {
  it("fetches a page and returns its markdown", async () => {
    const fetcher = createDefaultBookmarkContentFetcher({
      fetchImpl: makeFetchOk(articleHtml),
    });
    const result = await fetcher.fetch("https://example.com/post");
    expect(result.title).toBe("Sample Post");
    expect(result.markdown).toContain("first paragraph");
  });

  it("throws when the page returns non-2xx", async () => {
    const fetcher = createDefaultBookmarkContentFetcher({
      fetchImpl: () => Promise.resolve(new Response("", { status: 500 })),
    });
    await expect(
      fetcher.fetch("https://example.com/missing"),
    ).rejects.toThrow();
  });

  it("throws when no content can be extracted", async () => {
    const fetcher = createDefaultBookmarkContentFetcher({
      fetchImpl: makeFetchOk(
        "<!doctype html><html><body></body></html>",
      ),
    });
    await expect(fetcher.fetch("https://example.com")).rejects.toThrow();
  });
});
