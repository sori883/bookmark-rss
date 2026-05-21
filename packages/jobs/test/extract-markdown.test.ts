import { describe, expect, it } from "vitest";

import { extractMarkdownFromHtml } from "../src/extract-markdown";

describe("extractMarkdownFromHtml", () => {
  it("extracts article content as markdown", () => {
    const html = `<!doctype html>
<html><head><title>Example Article</title></head>
<body>
  <header><nav>Site nav</nav></header>
  <article>
    <h1>Example Article</h1>
    <p>This is the first paragraph of the article body. It has enough text to satisfy Readability's heuristics for content extraction.</p>
    <p>This is the second paragraph. It continues with more meaningful content so that the extractor can identify this as the main content of the page.</p>
    <h2>A section</h2>
    <p>Section content with <strong>bold</strong> and <a href="https://example.com">a link</a>.</p>
  </article>
  <footer>Site footer</footer>
</body></html>`;
    const result = extractMarkdownFromHtml(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Example Article");
    expect(result?.markdown).toContain("first paragraph");
    expect(result?.markdown).toContain("**bold**");
    expect(result?.markdown).toContain("[a link](https://example.com)");
    expect(result?.markdown).not.toContain("Site nav");
  });

  it("converts headings into atx style", () => {
    const html = `<!doctype html>
<html><body><article>
  <h1>Top heading</h1>
  <p>Some sufficiently long paragraph to make Readability happy. Lorem ipsum dolor sit amet consectetur adipiscing elit.</p>
  <h2>Sub heading</h2>
  <p>Another sufficiently long paragraph to keep Readability satisfied with this nested structure.</p>
</article></body></html>`;
    const result = extractMarkdownFromHtml(html);
    expect(result?.markdown).toContain("# Top heading");
    expect(result?.markdown).toContain("## Sub heading");
  });

  it("resolves relative image and link URLs against the baseUrl", () => {
    const html = `<!doctype html>
<html><body><article>
  <h1>Post</h1>
  <p>Long enough paragraph to make Readability accept this as the main article body without trouble.</p>
  <p>More content to keep Readability happy with the extraction. Another sentence to add weight.</p>
  <p>An image: <img src="/img/cover.png" alt="cover"> and a relative link: <a href="other.html">next</a>.</p>
</article></body></html>`;
    const result = extractMarkdownFromHtml(
      html,
      "https://example.com/blog/post-1",
    );
    expect(result?.markdown).toContain("https://example.com/img/cover.png");
    expect(result?.markdown).toContain("https://example.com/blog/other.html");
  });

  it("leaves already-absolute URLs untouched", () => {
    const html = `<!doctype html>
<html><body><article>
  <p>A long enough paragraph to satisfy Readability. Lorem ipsum dolor sit amet consectetur adipiscing elit, sed do eiusmod.</p>
  <p>Another paragraph to add weight for the extractor.</p>
  <p><img src="https://cdn.example.com/x.png" alt="x"></p>
</article></body></html>`;
    const result = extractMarkdownFromHtml(html, "https://other.com/page");
    expect(result?.markdown).toContain("https://cdn.example.com/x.png");
  });

  it("returns null when input is empty", () => {
    const result = extractMarkdownFromHtml("");
    expect(result).toBeNull();
  });

  it("returns null when body has nothing extractable", () => {
    const html =
      "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const result = extractMarkdownFromHtml(html);
    expect(result).toBeNull();
  });
});
