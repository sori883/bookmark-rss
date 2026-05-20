import { defineCommand } from "citty";
import pc from "picocolors";

import { NotLoggedInError, requireAuthedClient } from "../../lib/api.ts";

interface BookmarkRow {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  createdAt: string | number | null;
  tags: { id: string; name: string }[];
}

const formatDate = (value: string | number | null): string => {
  if (value === null) {
    return "";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toISOString().slice(0, 10);
};

export const bookmarkListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List bookmarks (optionally search with -q)",
  },
  args: {
    q: {
      type: "string",
      description: "Search query (full-text)",
      required: false,
    },
    limit: {
      type: "string",
      description: "Max rows to display (default 50)",
      default: "50",
    },
  },
  async run({ args }) {
    const limit = Math.max(1, Number.parseInt(args.limit, 10) || 50);
    const q =
      typeof args.q === "string" && args.q.length > 0 ? args.q : undefined;

    let client;
    try {
      ({ client } = await requireAuthedClient());
    } catch (err) {
      if (err instanceof NotLoggedInError) {
        console.error(pc.red(err.message));
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    const res = await client.api.main.bookmarks.$get({
      query: q ? { q } : {},
    });
    if (res.status === 401) {
      console.error(pc.red("Unauthorized. Run `bookmark login` again."));
      process.exitCode = 1;
      return;
    }
    if (!res.ok) {
      console.error(pc.red(`Request failed (HTTP ${res.status})`));
      process.exitCode = 1;
      return;
    }
    const rows = (await res.json()) as BookmarkRow[];
    if (rows.length === 0) {
      console.log(pc.dim(q ? `No matches for "${q}".` : "No bookmarks yet."));
      return;
    }
    const display = rows.slice(0, limit);
    for (const [i, b] of display.entries()) {
      const trimmed = b.title?.trim();
      const title =
        trimmed && trimmed.length > 0 ? trimmed : pc.dim("(no title)");
      const tags =
        b.tags.length > 0
          ? pc.cyan(b.tags.map((t) => `#${t.name}`).join(" "))
          : "";
      const date = formatDate(b.createdAt);
      console.log(`${pc.dim(`${i + 1}.`)} ${pc.bold(title)}`);
      console.log(`   ${pc.blue(b.url)}`);
      const meta = [date, tags].filter((s) => s.length > 0).join("  ");
      if (meta) {
        console.log(`   ${pc.dim(meta)}`);
      }
      console.log(`   ${pc.dim(b.id)}`);
    }
    if (rows.length > limit) {
      console.log(pc.dim(`\n+${rows.length - limit} more (use --limit)`));
    }
  },
});
