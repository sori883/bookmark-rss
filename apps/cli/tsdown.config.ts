import { defineConfig } from "tsdown";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: "../../.env" });

const baseUrl = process.env.BOOKMARK_API_URL?.trim().replace(/\/+$/, "");
if (!baseUrl) {
  throw new Error(
    "BOOKMARK_API_URL must be set (via .env or shell env) when building the CLI bundle.",
  );
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  outDir: "dist",
  target: "node22",
  shims: true,
  clean: true,
  noExternal: ["citty", "@clack/prompts", "picocolors"],
  define: {
    "process.env.BOOKMARK_API_URL": JSON.stringify(baseUrl),
  },
});
