# Suggested Commands

- Install: `pnpm install` (postinstall runs workspace lint via sherif).
- Dev all workspaces: `pnpm dev` (Turbo watch). Expected local ports: web 3000, worker-jobs 8788, worker-ai 8789.
- Web only: `pnpm -F @acme/web dev`.
- Extension dev: `pnpm -F @acme/extension dev`; Firefox: `pnpm -F @acme/extension dev:firefox`.
- CLI entry during development: `pnpm cli`; package build: `pnpm -F @acme/cli build`.
- Trigger local jobs: `pnpm -F @acme/worker-jobs trigger`; `pnpm -F @acme/worker-ai trigger`.
- Local DB server (external tool): `turso dev --db-file .datastore/db.sqlite`.
- DB schema generation/push: `pnpm db:generate`, `pnpm db:push`, `pnpm db:apply-extras`.
- Auth schema generation: `pnpm auth:generate`.
- Validation: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Fixers: `pnpm format:fix`, `pnpm lint:fix`.
- Production deploy: `pnpm deploy:prod`; DB prod migrations separately: `pnpm db:migrate:prod`, `pnpm db:apply-extras:prod`.
- Serena memory sanity check after onboarding/edits: `serena memories check` from repo root.