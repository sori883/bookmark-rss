#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

import { bookmarkCommand } from "./commands/bookmark/index.ts";
import { docsCommand } from "./commands/docs.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand } from "./commands/logout.ts";

const main = defineCommand({
  meta: {
    name: "bookmark",
    version: "0.1.0",
    description: "bookmark-rss CLI",
  },
  subCommands: {
    login: loginCommand,
    logout: logoutCommand,
    bookmark: bookmarkCommand,
    docs: docsCommand,
  },
});

void runMain(main);
