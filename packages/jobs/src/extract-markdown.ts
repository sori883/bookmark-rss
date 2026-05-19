import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export interface ExtractedContent {
  title: string | null;
  markdown: string;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

/**
 * Extracts the main content of an HTML document and converts it to Markdown.
 * Returns null when Readability cannot find an article-like structure.
 */
type ReadabilityDoc = ConstructorParameters<typeof Readability>[0];

interface MinimalElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

interface MinimalDocument {
  querySelectorAll(selector: string): Iterable<MinimalElement>;
}

const resolveRelativeUrls = (doc: MinimalDocument, baseUrl: string): void => {
  const resolve = (value: string | null): string | null => {
    if (!value) return value;
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return value;
    }
  };
  for (const el of doc.querySelectorAll("img[src]")) {
    const next = resolve(el.getAttribute("src"));
    if (next) el.setAttribute("src", next);
  }
  for (const el of doc.querySelectorAll("a[href]")) {
    const next = resolve(el.getAttribute("href"));
    if (next) el.setAttribute("href", next);
  }
};

export const extractMarkdownFromHtml = (
  html: string,
  baseUrl?: string,
): ExtractedContent | null => {
  let document: ReadabilityDoc;
  try {
    // linkedom's parseHTML is typed as `(html: any) => Window`; the resulting
    // `document` quacks like a DOM Document but isn't structurally compatible
    // with Readability's expected type, so we bridge via a runtime cast.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
    document = parseHTML(html).document as unknown as ReadabilityDoc;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
  } catch {
    return null;
  }

  if (baseUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      resolveRelativeUrls(document as unknown as MinimalDocument, baseUrl);
    } catch {
      // best-effort: if URL resolution fails for some reason, fall through
    }
  }

  let article;
  try {
    const reader = new Readability(document);
    article = reader.parse();
  } catch {
    return null;
  }
  if (!article?.content) return null;

  const markdown = turndown.turndown(article.content).trim();
  if (!markdown) return null;

  const titleTrimmed = article.title?.trim();
  return {
    title: titleTrimmed && titleTrimmed.length > 0 ? titleTrimmed : null,
    markdown,
  };
};
