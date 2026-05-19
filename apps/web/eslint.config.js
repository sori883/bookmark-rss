import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@acme/eslint-config/base";
import { tanstackConfig } from "@acme/eslint-config/tanstack";

export default defineConfig(
  baseConfig,
  tanstackConfig,
  restrictEnvAccess,
  // tanstackConfig が parserOptions.project を設定する一方、baseConfig は
  // projectService を使うため両立しない。projectService 側を最終的に採用する。
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
