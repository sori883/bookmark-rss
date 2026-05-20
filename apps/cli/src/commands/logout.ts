import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";

import { clearConfig, loadConfig } from "../lib/config.ts";

export const logoutCommand = defineCommand({
  meta: {
    name: "logout",
    description: "Remove saved credentials",
  },
  args: {
    yes: {
      type: "boolean",
      description: "Skip the confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    intro(pc.bold("bookmark-rss logout"));
    const cfg = await loadConfig();
    if (!cfg) {
      outro("Nothing to remove.");
      return;
    }
    if (!args.yes) {
      const ok = await confirm({
        message: "Sign out?",
      });
      if (isCancel(ok) || !ok) {
        cancel("Cancelled.");
        return;
      }
    }
    await clearConfig();
    outro(pc.green("Signed out."));
  },
});
