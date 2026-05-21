import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

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
    host_permissions: ["http://localhost:3000/*"],
    action: {
      default_title: "bookmark-rss",
    },
  },
});
