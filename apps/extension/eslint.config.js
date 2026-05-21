import { defineConfig } from "eslint/config";

import { baseConfig, importConfig } from "@acme/eslint-config/base";

export default defineConfig(
  {
    ignores: [".wxt/**", "dist/**", "node_modules/**"],
  },
  baseConfig,
  importConfig,
);
