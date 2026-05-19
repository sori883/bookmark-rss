import { defineConfig } from "eslint/config";

import {
  baseConfig,
  importConfig,
  restrictEnvAccess,
} from "@acme/eslint-config/base";

export default defineConfig(
  {
    ignores: ["script/**"],
  },
  baseConfig,
  importConfig,
  restrictEnvAccess,
);
