import { XMLParser } from "fast-xml-parser";

export interface OpmlEntry {
  feedUrl: string;
  title: string;
  siteUrl: string | null;
}

interface OpmlOutline {
  "@_xmlUrl"?: string;
  "@_htmlUrl"?: string;
  "@_title"?: string;
  "@_text"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

interface OpmlBody {
  outline?: OpmlOutline | OpmlOutline[];
}

interface ParsedOpml {
  opml?: {
    body?: OpmlBody | string;
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const asAttr = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const walk = (node: OpmlOutline, acc: OpmlEntry[]): void => {
  const feedUrl = asAttr(node["@_xmlUrl"]);
  if (feedUrl) {
    const title = asAttr(node["@_title"]) ?? asAttr(node["@_text"]) ?? feedUrl;
    const siteUrl = asAttr(node["@_htmlUrl"]) ?? null;
    acc.push({ feedUrl, title, siteUrl });
  }
  const children = node.outline;
  if (!children) {
    return;
  }
  if (Array.isArray(children)) {
    for (const child of children) {
      walk(child, acc);
    }
  } else {
    walk(children, acc);
  }
};

export const parseOpml = (xml: string): OpmlEntry[] => {
  let parsed: ParsedOpml;
  try {
    parsed = parser.parse(xml) as ParsedOpml;
  } catch {
    throw new Error("Invalid OPML: failed to parse XML");
  }
  if (!parsed.opml || !("body" in parsed.opml)) {
    throw new Error("Invalid OPML: missing <opml><body>");
  }
  const body = parsed.opml.body;
  if (typeof body !== "object") {
    return [];
  }
  const root = body.outline;
  if (!root) {
    return [];
  }
  const entries: OpmlEntry[] = [];
  if (Array.isArray(root)) {
    for (const o of root) {
      walk(o, entries);
    }
  } else {
    walk(root, entries);
  }
  return entries;
};
