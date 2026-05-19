import { XMLParser } from "fast-xml-parser";

export interface FetchedArticle {
  url: string;
  title: string;
  description: string | null;
  ogImageUrl: string | null;
  publishedAt: Date | null;
}

export interface ArticleFetcher {
  fetchArticles(feedUrl: string): Promise<FetchedArticle[]>;
}

export interface DefaultArticleFetcherOptions {
  fetchImpl?: typeof fetch;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const textOf = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v) {
    const t = (v as { "#text"?: unknown })["#text"];
    if (typeof t === "string") return t.trim() || null;
    if (typeof t === "number") return String(t);
  }
  return null;
};

const parseDate = (v: unknown): Date | null => {
  const s = textOf(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const asArray = <T>(v: T | T[] | undefined | null): T[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
};

interface RssEnclosure {
  "@_url"?: string;
  "@_type"?: string;
}

interface RssGuid {
  "@_isPermaLink"?: string;
  "#text"?: string;
}

interface MediaThumbnail {
  "@_url"?: string;
}

interface RssItem {
  title?: unknown;
  link?: unknown;
  description?: unknown;
  pubDate?: unknown;
  guid?: string | RssGuid;
  enclosure?: RssEnclosure | RssEnclosure[];
  "media:thumbnail"?: MediaThumbnail | MediaThumbnail[];
  "media:content"?: MediaThumbnail | MediaThumbnail[];
}

interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
  "@_type"?: string;
}

interface AtomEntry {
  title?: unknown;
  link?: AtomLink | AtomLink[] | string;
  summary?: unknown;
  content?: unknown;
  published?: unknown;
  updated?: unknown;
  "media:thumbnail"?: MediaThumbnail | MediaThumbnail[];
}

interface ParsedFeed {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
  feed?: { entry?: AtomEntry | AtomEntry[] };
}

const extractImageFromRssItem = (item: RssItem): string | null => {
  const media =
    asArray(item["media:thumbnail"])[0] ?? asArray(item["media:content"])[0];
  if (media?.["@_url"]) return media["@_url"];
  const enclosure = asArray(item.enclosure).find((e) =>
    e["@_type"]?.startsWith("image/"),
  );
  return enclosure?.["@_url"] ?? null;
};

const extractRssUrl = (item: RssItem): string | null => {
  const link = textOf(item.link);
  if (link) return link;
  const guid = item.guid;
  if (typeof guid === "string") return guid;
  if (guid && typeof guid === "object") {
    if (guid["@_isPermaLink"] !== "false") {
      return textOf(guid["#text"]) ?? null;
    }
  }
  return null;
};

const parseRssItems = (items: RssItem[]): FetchedArticle[] => {
  const out: FetchedArticle[] = [];
  for (const item of items) {
    const url = extractRssUrl(item);
    const title = textOf(item.title);
    if (!url || !title) continue;
    out.push({
      url,
      title,
      description: textOf(item.description),
      ogImageUrl: extractImageFromRssItem(item),
      publishedAt: parseDate(item.pubDate),
    });
  }
  return out;
};

const extractAtomUrl = (entry: AtomEntry): string | null => {
  const link = entry.link;
  if (typeof link === "string") return link;
  const links = asArray(link).filter(
    (l): l is AtomLink => typeof l === "object",
  );
  const alternate = links.find(
    (l) => !l["@_rel"] || l["@_rel"] === "alternate",
  );
  return alternate?.["@_href"] ?? links[0]?.["@_href"] ?? null;
};

const parseAtomEntries = (entries: AtomEntry[]): FetchedArticle[] => {
  const out: FetchedArticle[] = [];
  for (const entry of entries) {
    const url = extractAtomUrl(entry);
    const title = textOf(entry.title);
    if (!url || !title) continue;
    const description = textOf(entry.summary) ?? textOf(entry.content);
    const publishedAt = parseDate(entry.published) ?? parseDate(entry.updated);
    const media = asArray(entry["media:thumbnail"])[0];
    out.push({
      url,
      title,
      description,
      ogImageUrl: media?.["@_url"] ?? null,
      publishedAt,
    });
  }
  return out;
};

export const createDefaultArticleFetcher = (
  options: DefaultArticleFetcherOptions = {},
): ArticleFetcher => {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async fetchArticles(feedUrl: string): Promise<FetchedArticle[]> {
      const res = await fetchImpl(feedUrl, {
        headers: {
          accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch feed: ${res.status}`);
      }
      const body = await res.text();
      let parsed: ParsedFeed;
      try {
        parsed = parser.parse(body) as ParsedFeed;
      } catch {
        throw new Error("Failed to parse feed XML");
      }

      if (parsed.rss?.channel) {
        const items = asArray(parsed.rss.channel.item);
        return parseRssItems(items);
      }
      if (parsed.feed) {
        const entries = asArray(parsed.feed.entry);
        return parseAtomEntries(entries);
      }
      throw new Error("Unrecognized feed format");
    },
  };
};
