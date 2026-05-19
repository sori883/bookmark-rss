import { defineConfig } from "eslint/config";

import { baseConfig, importConfig } from "@acme/eslint-config/base";
import { honoConfig } from "@acme/eslint-config/hono";

export default defineConfig(baseConfig, importConfig, honoConfig);
