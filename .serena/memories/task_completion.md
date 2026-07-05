# Task Completion

- For code changes, run the narrowest package-level validation first when possible:
  - Package tests: `pnpm -F @acme/<pkg> test` when the package has tests.
  - Package typecheck: `pnpm -F @acme/<pkg> typecheck`.
  - Package lint/format checks: `pnpm -F @acme/<pkg> lint`, `pnpm -F @acme/<pkg> format`.
- Before broad completion or cross-package changes, run root validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format`.
- For DB schema changes: generate/migrate/push as appropriate, then `pnpm db:apply-extras` if FTS/triggers/extras could be affected.
- For auth schema changes: run `pnpm auth:generate`; generated output is `packages/db/src/auth-schema.ts`.
- For Cloudflare binding/config changes: run relevant package `cf-typegen` if binding types may change.
- For frontend UI changes, run package tests/typecheck and visually verify the relevant local route when feasible.
- Do not use root `clean` unless explicitly intended; it is destructive (`git clean -xdf node_modules`).