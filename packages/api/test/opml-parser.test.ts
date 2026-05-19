import { describe, expect, it } from "vitest";

import { parseOpml } from "../src/services/opml-parser";

describe("parseOpml", () => {
  it("extracts feeds from a flat OPML", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Subscriptions</title></head>
  <body>
    <outline type="rss" text="A" title="Feed A" xmlUrl="https://a.example.com/feed" htmlUrl="https://a.example.com"/>
    <outline type="rss" text="B" xmlUrl="https://b.example.com/feed"/>
  </body>
</opml>`;
    expect(parseOpml(opml)).toEqual([
      {
        feedUrl: "https://a.example.com/feed",
        title: "Feed A",
        siteUrl: "https://a.example.com",
      },
      {
        feedUrl: "https://b.example.com/feed",
        title: "B",
        siteUrl: null,
      },
    ]);
  });

  it("extracts feeds from nested category outlines", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline type="rss" text="A" xmlUrl="https://a.example.com/feed"/>
      <outline text="Subtopic">
        <outline type="rss" text="B" xmlUrl="https://b.example.com/feed"/>
      </outline>
    </outline>
    <outline type="rss" text="C" xmlUrl="https://c.example.com/feed"/>
  </body>
</opml>`;
    expect(parseOpml(opml).map((f) => f.feedUrl)).toEqual([
      "https://a.example.com/feed",
      "https://b.example.com/feed",
      "https://c.example.com/feed",
    ]);
  });

  it("skips outlines that don't have xmlUrl (categories)", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="EmptyCategory"/>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
    expect(parseOpml(opml)).toHaveLength(1);
  });

  it("prefers title over text for the feed name", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline title="Title Wins" text="Text Loses" xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
    expect(parseOpml(opml)[0]?.title).toBe("Title Wins");
  });

  it("falls back to xmlUrl when both title and text are missing", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
    expect(parseOpml(opml)[0]?.title).toBe("https://a.example.com/feed");
  });

  it("returns empty array when body has no outlines", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body></body></opml>`;
    expect(parseOpml(opml)).toEqual([]);
  });

  it("throws when the input is not OPML", () => {
    expect(() => parseOpml("not xml at all")).toThrow();
    expect(() => parseOpml("<html><body>nope</body></html>")).toThrow();
  });
});
