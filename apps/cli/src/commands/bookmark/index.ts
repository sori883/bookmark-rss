import { defineCommand } from "citty";

import { bookmarkAddCommand } from "./add.ts";
import { bookmarkDeleteCommand } from "./delete.ts";
import { bookmarkListCommand } from "./list.ts";

export const bookmarkCommand = defineCommand({
  meta: {
    name: "bookmark",
    description: "Manage bookmarks",
  },
  subCommands: {
    add: bookmarkAddCommand,
    list: bookmarkListCommand,
    delete: bookmarkDeleteCommand,
  },
});
