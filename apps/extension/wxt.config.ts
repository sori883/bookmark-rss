import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// Resolve VITE_API_BASE_URL at config-eval time so manifest.host_permissions
// matches the URL baked into the bundle. dev defaults to localhost; for
// production builds, run `pnpm build:prod` which loads `.env.prod` first.
const fallbackBaseUrl = "http://localhost:3000";
const apiBaseUrl =
  process.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? fallbackBaseUrl;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "dist",
  dev: {
    server: {
      port: 3200,
      origin: "http://localhost:3200",
    },
  },
  webExt: {
    disabled: true,
  },
  vite: () => ({
    envDir: "../..",
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "bookmark-rss",
    description: "Bookmark the current tab to bookmark-rss",
    permissions: ["activeTab", "storage"],
    host_permissions: [`${apiBaseUrl}/*`],
    action: {
      default_title: "bookmark-rss",
    },
  },
});
