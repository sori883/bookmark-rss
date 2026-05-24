import { useState } from "react";
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { Menu } from "lucide-react";

import Sidebar from "~/components/Sidebar";
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
  loader: async () => {
    const api = makeApiClient();
    const [feedsRes, categoriesRes] = await Promise.all([
      api.api.main.feeds.$get(),
      api.api.main.categories.$get(),
    ]);
    return {
      feeds: feedsRes.ok ? await feedsRes.json() : [],
      categories: categoriesRes.ok ? await categoriesRes.json() : [],
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const { feeds, categories } = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  return (
    <div className="flex w-full">
      <Sidebar
        key={location.pathname}
        open={open}
        onClose={close}
        feeds={feeds}
        categories={categories}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] lg:hidden"
          aria-label="メニューを開く"
          aria-expanded={open}
        >
          <Menu className="h-4 w-4" aria-hidden />
          メニュー
        </button>
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
