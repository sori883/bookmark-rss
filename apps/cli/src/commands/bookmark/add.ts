import { cancel, intro, isCancel, outro, spinner, text } from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";

import { NotLoggedInError, requireAuthedClient } from "../../lib/api.ts";

const isUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export const bookmarkAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add a bookmark",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to bookmark",
      required: false,
    },
  },
  async run({ args }) {
    intro(pc.bold("bookmark add"));

    let url = typeof args.url === "string" ? args.url.trim() : "";
    if (!url) {
      const answer = await text({
        message: "URL",
        validate: (v) => (isUrl(v) ? undefined : "Enter an http(s) URL"),
      });
      if (isCancel(answer)) {
        cancel("Cancelled.");
        return;
      }
      url = answer.trim();
    } else if (!isUrl(url)) {
      cancel("Invalid URL.");
      process.exitCode = 1;
      return;
    }

    let client;
    try {
      ({ client } = await requireAuthedClient());
    } catch (err) {
      if (err instanceof NotLoggedInError) {
        cancel(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    const s = spinner();
    s.start("Adding bookmark...");
    const res = await client.api.main.bookmarks.$post({ json: { url } });
    if (res.status === 201) {
      const created = (await res.json()) as { title: string; url: string };
      s.stop("Added.");
      outro(`${pc.green("+")} ${pc.bold(created.title)}\n  ${pc.dim(created.url)}`);
      return;
    }
    if (res.status === 401) {
      s.stop("Unauthorized. Run `bookmark login` again.");
      process.exitCode = 1;
      return;
    }
    if (res.status === 409) {
      s.stop("Already bookmarked.");
      return;
    }
    if (res.status === 422) {
      s.stop("Could not fetch the page.");
      process.exitCode = 1;
      return;
    }
    s.stop(`Unexpected response (HTTP ${res.status})`);
    process.exitCode = 1;
  },
});
