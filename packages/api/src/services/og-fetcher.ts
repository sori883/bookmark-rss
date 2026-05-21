import type { OgFetcher, OgMetadata } from "../env";

export interface DefaultOgFetcherOptions {
  fetchImpl?: typeof fetch;
}

// Some CDNs (e.g. CloudFront in front of connpass) reject requests without a
// browser-style User-Agent. Mirror current Safari to maximize compatibility.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

const decodeEntities = (s: string): string =>
  s
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const extractMetaContent = (html: string, property: string): string | null => {
  const metaTagRe = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(metaTagRe)) {
    const tag = match[0];
    const propRe = new RegExp(
      `\\b(?:property|name)\\s*=\\s*["']${property}["']`,
      "i",
    );
    if (!propRe.test(tag)) {
      continue;
    }
    const contentMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = contentMatch?.[1] ?? contentMatch?.[2];
    if (value !== undefined) {
      return decodeEntities(value).trim() || null;
    }
  }
  return null;
};

const extractTitleTag = (html: string): string | null => {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) {
    return null;
  }
  return decodeEntities(match[1]).trim() || null;
};

export const createDefaultOgFetcher = (
  options: DefaultOgFetcherOptions = {},
): OgFetcher => {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async fetch(url: string): Promise<OgMetadata> {
      const res = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,*/*",
          "user-agent": BROWSER_UA,
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch page: ${res.status}`);
      }
      const html = await res.text();

      const title =
        extractMetaContent(html, "og:title") ?? extractTitleTag(html) ?? url;
      const description = extractMetaContent(html, "og:description");
      const imageRaw = extractMetaContent(html, "og:image");
      let imageUrl: string | null = null;
      if (imageRaw) {
        try {
          imageUrl = new URL(imageRaw, url).toString();
        } catch {
          imageUrl = null;
        }
      }

      return { title, description, imageUrl };
    },
  };
};
