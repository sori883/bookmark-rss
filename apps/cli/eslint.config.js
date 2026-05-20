import { defineConfig } from "eslint/config";

import { baseConfig, importConfig } from "@acme/eslint-config/base";

export default defineConfig(baseConfig, importConfig);
