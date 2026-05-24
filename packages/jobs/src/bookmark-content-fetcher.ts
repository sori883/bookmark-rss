import { extractMarkdownFromHtml } from "./extract-markdown";

export interface FetchedBookmarkContent {
  title: string | null;
  markdown: string;
}

export interface BookmarkContentFetcher {
  fetch(url: string): Promise<FetchedBookmarkContent>;
}

export interface DefaultBookmarkContentFetcherOptions {
  fetchImpl?: typeof fetch;
}

const PDF_PLACEHOLDER_MARKDOWN =
  "_PDF のためプレビューできません。元の URL を参照してください。_";

const isPdfResponse = (url: string, contentType: string | null): boolean => {
  if (contentType?.toLowerCase().includes("application/pdf")) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return false;
  }
};

export const createDefaultBookmarkContentFetcher = (
  options: DefaultBookmarkContentFetcherOptions = {},
): BookmarkContentFetcher => {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async fetch(url: string): Promise<FetchedBookmarkContent> {
      const res = await fetchImpl(url, {
        headers: { accept: "text/html,application/xhtml+xml,*/*" },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch page: ${res.status}`);
      }
      if (isPdfResponse(url, res.headers.get("content-type"))) {
        return { title: null, markdown: PDF_PLACEHOLDER_MARKDOWN };
      }
      const html = await res.text();
      const result = extractMarkdownFromHtml(html, url);
      if (!result) {
        throw new Error("Could not extract content");
      }
      return result;
    },
  };
};
