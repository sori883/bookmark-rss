# Tech Stack

- Package manager: pnpm workspaces, root `packageManager` pnpm 10.19.0, Node engine ^24.15.0, `.nvmrc` present.
- Build orchestration: Turborepo 2.5.x; root tasks include build/dev/format/lint/typecheck/test and db tasks.
- Language: TypeScript ESM everywhere; shared TS base targets ES2022, module/moduleResolution Preserve/Bundler, strict + noUncheckedIndexedAccess.
- Web app: TanStack Start/Router, React 19, Vite 8, Tailwind CSS 4, Cloudflare Vite plugin, Wrangler.
- API: Hono 4 with `@hono/zod-validator`, zod 4, typed client export from `@acme/api/client`.
- DB: libSQL/Turso SQLite, Drizzle ORM/Kit, Drizzle migrations in `packages/db/migrations`, extra SQL handled by `packages/db/scripts/apply-extras.mjs`.
- Auth: Better Auth in `packages/auth`; generated auth schema output is `packages/db/src/auth-schema.ts`.
- Jobs/content extraction: Mozilla Readability, linkedom, Turndown, fast-xml-parser, SQLite FTS5 extras.
- AI recommendations: Vercel AI SDK `ai`, Vertex AI Gemini via Cloudflare AI Gateway, Discord webhook notifications.
- Extension: WXT 0.20 with React module; Chrome/Firefox scripts.
- CLI: `citty`, `@clack/prompts`, `hono` client types, bundled by tsdown.
- Tooling packages: `@acme/eslint-config`, `@acme/prettier-config`, `@acme/tailwind-config`, `@acme/tsconfig`, GitHub action setup package.