import { XMLParser } from "fast-xml-parser";

import type { FeedFetcher, FeedMetadata } from "../env";

interface RssChannel {
  title?: string | { "#text"?: string };
  link?: string | { "#text"?: string };
}

interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
  "#text"?: string;
}

interface AtomFeed {
  title?: string | { "#text"?: string };
  link?: AtomLink | AtomLink[] | string;
}

interface ParsedXml {
  rss?: { channel?: RssChannel };
  feed?: AtomFeed;
}

const FEED_HEADERS = {
  accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

const SUFFIXES = ["/feed", "/feed.xml", "/rss", "/rss.xml", "/atom.xml"];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const textOf = (v: unknown): string | null => {
  if (typeof v === "string") {
    return v.trim() || null;
  }
  if (v && typeof v === "object" && "#text" in v) {
    const t = (v as { "#text"?: unknown })["#text"];
    return typeof t === "string" ? t.trim() || null : null;
  }
  return null;
};

const parseFeedSafely = (
  body: string,
): { title: string; siteUrl: string | null } | null => {
  let parsed: ParsedXml;
  try {
    parsed = parser.parse(body) as ParsedXml;
  } catch {
    return null;
  }

  if (parsed.rss?.channel) {
    const title = textOf(parsed.rss.channel.title);
    if (!title) {
      return null;
    }
    const siteUrl = textOf(parsed.rss.channel.link);
    return { title, siteUrl };
  }

  if (parsed.feed) {
    const title = textOf(parsed.feed.title);
    if (!title) {
      return null;
    }
    const link = parsed.feed.link;
    const links: AtomLink[] = Array.isArray(link)
      ? link
      : typeof link === "object"
        ? [link]
        : [];
    const siteLink = links.find(
      (l) => !l["@_rel"] || l["@_rel"] === "alternate",
    );
    return { title, siteUrl: siteLink?.["@_href"] ?? null };
  }

  return null;
};

const looksLikeHtml = (contentType: string, body: string): boolean => {
  if (contentType.toLowerCase().includes("html")) {
    return true;
  }
  return /^\s*<(!doctype html|html\b)/i.test(body);
};

const findAlternateFeedLink = (
  html: string,
  baseUrl: string,
): string | null => {
  const linkTagRe = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(linkTagRe)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?alternate["']?/i.test(tag)) {
      continue;
    }
    if (!/\btype\s*=\s*["']?application\/(rss|atom)\+xml["']?/i.test(tag)) {
      continue;
    }
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = hrefMatch?.[1];
    if (!href) {
      continue;
    }
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
};

function* candidateUrls(input: string): IterableIterator<string> {
  yield input;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return;
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  for (const s of SUFFIXES) {
    yield `${parsed.origin}${path}${s}`;
  }
  if (path !== "") {
    for (const s of SUFFIXES) {
      yield `${parsed.origin}${s}`;
    }
  }
}

export interface DefaultFeedFetcherOptions {
  fetchImpl?: typeof fetch;
}

export const createDefaultFeedFetcher = (
  options: DefaultFeedFetcherOptions = {},
): FeedFetcher => {
  const fetchImpl = options.fetchImpl ?? fetch;

  const fetchText = async (
    url: string,
  ): Promise<{ body: string; contentType: string } | null> => {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: FEED_HEADERS });
    } catch {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    return {
      body: await res.text(),
      contentType: res.headers.get("content-type") ?? "",
    };
  };

  return {
    async fetchMetadata(url: string): Promise<FeedMetadata> {
      const seen = new Set<string>();
      for (const candidate of candidateUrls(url)) {
        if (seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);

        const fetched = await fetchText(candidate);
        if (!fetched) {
          continue;
        }

        const meta = parseFeedSafely(fetched.body);
        if (meta) {
          return { ...meta, feedUrl: candidate };
        }

        if (looksLikeHtml(fetched.contentType, fetched.body)) {
          const altUrl = findAlternateFeedLink(fetched.body, candidate);
          if (altUrl && !seen.has(altUrl)) {
            seen.add(altUrl);
            const altFetched = await fetchText(altUrl);
            if (altFetched) {
              const altMeta = parseFeedSafely(altFetched.body);
              if (altMeta) {
                return { ...altMeta, feedUrl: altUrl };
              }
            }
          }
        }
      }
      throw new Error(`Could not discover a feed from ${url}`);
    },
  };
};
