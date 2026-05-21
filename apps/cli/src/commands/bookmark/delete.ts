import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  spinner,
} from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";

import {
  NotLoggedInError,
  cliRawRequest,
  requireAuthedClient,
} from "../../lib/api.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BookmarkRow {
  id: string;
  title: string | null;
  url: string;
}

const displayTitle = (row: BookmarkRow): string => {
  const t = row.title?.trim();
  return t && t.length > 0 ? t : row.url;
};

export const bookmarkDeleteCommand = defineCommand({
  meta: {
    name: "delete",
    description: "Delete a bookmark by full UUID",
  },
  args: {
    id: {
      type: "positional",
      description: "Bookmark id (full UUID; see `bookmark list`)",
      required: true,
    },
    yes: {
      type: "boolean",
      description: "Skip the confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    intro(pc.bold("bookmark delete"));

    if (!UUID_RE.test(args.id)) {
      cancel(
        `"${args.id}" is not a full UUID. Run \`bookmark list\` to find ids.`,
      );
      process.exitCode = 1;
      return;
    }

    let config;
    try {
      ({ config } = await requireAuthedClient());
    } catch (err) {
      if (err instanceof NotLoggedInError) {
        cancel(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    const lookup = spinner();
    lookup.start("Fetching bookmark...");
    const getRes = await cliRawRequest(
      config,
      "GET",
      `/api/main/bookmarks/${encodeURIComponent(args.id)}`,
    );
    if (getRes.status === 404) {
      lookup.stop("Not found.");
      process.exitCode = 1;
      return;
    }
    if (getRes.status === 401) {
      lookup.stop("Unauthorized. Run `bookmark login` again.");
      process.exitCode = 1;
      return;
    }
    if (!getRes.ok) {
      lookup.stop(`Unexpected response (HTTP ${getRes.status})`);
      process.exitCode = 1;
      return;
    }
    const row = (await getRes.json()) as BookmarkRow;
    lookup.stop(`Found: ${displayTitle(row)}`);

    if (!args.yes) {
      const ok = await confirm({
        message: `Delete ${displayTitle(row)}?`,
        initialValue: false,
      });
      if (isCancel(ok) || !ok) {
        cancel("Cancelled.");
        return;
      }
    }

    const s = spinner();
    s.start("Deleting...");
    const res = await cliRawRequest(
      config,
      "DELETE",
      `/api/main/bookmarks/${encodeURIComponent(args.id)}`,
    );
    if (res.status === 204) {
      s.stop("Deleted.");
      outro(pc.green("Done."));
      return;
    }
    if (res.status === 401) {
      s.stop("Unauthorized. Run `bookmark login` again.");
      process.exitCode = 1;
      return;
    }
    if (res.status === 404) {
      s.stop("Not found.");
      process.exitCode = 1;
      return;
    }
    s.stop(`Unexpected response (HTTP ${res.status})`);
    process.exitCode = 1;
  },
});
