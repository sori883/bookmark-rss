# Conventions

- Workspace imports use `@acme/*`; app-local alias in web package is `#/*` to `apps/web/src/*`.
- Prefer package-local scripts via `pnpm -F @acme/<pkg> <script>` for focused work; root scripts fan out through Turbo.
- Env access convention: packages using validated env should not directly use `process.env` outside allowed `env.ts`; ESLint enforces this via shared config.
- TypeScript is strict; non-null assertions are lint errors; unused args/vars must be prefixed `_` if intentional.
- Type imports should use separate type imports; Prettier config sorts imports in groups: node, react, tanstack, hono, third-party, `@acme`, relative, `~/`.
- Prettier uses Tailwind class sorting and recognizes `cn`/`cva` as Tailwind functions.
- Web styling uses Tailwind CSS 4 plus CSS theme tokens from shared tailwind package. Themes are sepia light and near-black dark.
- Cloudflare workers use `nodejs_compat`. Web worker has service binding `JOBS` to `bookmark-rss-jobs`.
- worker-jobs and worker-ai disable public workers.dev URL and run on cron; local trigger endpoints exist for manual execution.
- DB extras such as FTS5/triggers live outside Drizzle schema and must be applied with `apply-extras` after push/migrate when needed.
- Generated/build/cache outputs should be ignored as sources: `.cache`, `.turbo`, `dist`, `.wrangler`, `.wxt`, `.tanstack`, `node_modules`.