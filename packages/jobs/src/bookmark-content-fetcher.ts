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
      const html = await res.text();
      const result = extractMarkdownFromHtml(html, url);
      if (!result) {
        throw new Error("Could not extract content");
      }
      return result;
    },
  };
};
