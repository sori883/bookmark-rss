import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "tsdown";

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
  // Bundle every dependency. The CLI ships as a single file with no
  // node_modules at the install site, so anything external would fail at
  // runtime (hono/client, citty, @acme/*, etc.).
  noExternal: [/.*/],
  define: {
    "process.env.BOOKMARK_API_URL": JSON.stringify(baseUrl),
  },
});
