import { tanstackConfig as baseTanstackConfig } from "@tanstack/eslint-config";
import { defineConfig } from "eslint/config";

export const tanstackConfig = defineConfig(
  baseTanstackConfig,
  // TanStack Router の redirect() / notFound() は Response を throw する慣用。
  // ルートファイル内では only-throw-error を許可する。
  {
    files: ["**/routes/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/only-throw-error": "off",
    },
  },
);
