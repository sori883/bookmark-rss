import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";

import { makeApiClient } from "~/lib/api-client";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const api = makeApiClient();
    const res = await api.api.main.me.$get();
    if (!res.ok) {
      throw redirect({ to: "/" });
    }
    const user = await res.json();
    if (!user) {
      throw redirect({ to: "/" });
    }
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <main className="page-wrap py-6">
      <nav className="mb-6 flex gap-1 border-b border-[var(--border)]">
        <TabLink to="/app/articles" label="Articles" />
        <TabLink to="/app/feeds" label="Feeds" />
        <TabLink to="/app/bookmarks" label="Bookmarks" />
      </nav>
      <Outlet />
    </main>
  );
}

function TabLink({
  to,
  label,
}: {
  to: "/app/articles" | "/app/feeds" | "/app/bookmarks";
  label: string;
}) {
  return (
    <Link
      to={to}
      className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
      activeProps={{
        className:
          "-mb-px border-b-2 border-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--text)] no-underline",
      }}
    >
      {label}
    </Link>
  );
}
