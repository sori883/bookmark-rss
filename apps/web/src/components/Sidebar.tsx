import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Rss,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

import ThemeToggle from "./ThemeToggle";

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed-categories";

const readCollapsed = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
};

const PRIMARY_NAV = [
  { to: "/app/feeds", label: "Feeds", icon: Rss },
  { to: "/app/bookmarks", label: "Bookmarks", icon: Bookmark },
  {
    to: "/app/recommendations/today",
    label: "今日のおすすめ",
    icon: Sparkles,
  },
] as const;

const UNCATEGORIZED = "__uncategorized__";

type NavTo = (typeof PRIMARY_NAV)[number]["to"] | "/app/settings";

interface FeedItem {
  id: string;
  title: string;
  categoryId: string | null;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  feeds: Array<FeedItem>;
  categories: Array<CategoryItem>;
}

export default function Sidebar({
  open,
  onClose,
  feeds,
  categories,
}: SidebarProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Array<FeedItem>>();
    for (const c of categories) map.set(c.id, []);
    map.set(UNCATEGORIZED, []);
    for (const f of feeds) {
      const key = f.categoryId ?? UNCATEGORIZED;
      const bucket = map.get(key);
      if (bucket) bucket.push(f);
      else map.set(key, [f]);
    }
    return map;
  }, [feeds, categories]);

  const groups: Array<CategoryItem> = [
    ...categories,
    { id: UNCATEGORIZED, name: "未分類" },
  ];

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(
          COLLAPSED_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // ignore quota or disabled storage
      }
      return next;
    });
  }, []);

  return (
    <>
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--surface)]",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0",
        ].join(" ")}
        aria-label="Primary navigation"
      >
        <div className="flex h-14 items-center justify-end border-b border-[var(--border)] px-4 lg:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="メニューを閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 [scrollbar-gutter:stable] flex-col gap-1 overflow-y-auto p-3">
          <nav className="flex flex-col gap-1">
            {PRIMARY_NAV.map((item) => (
              <SidebarLink
                key={item.to}
                to={item.to}
                label={item.label}
                Icon={item.icon}
                onNavigate={onClose}
              />
            ))}
          </nav>
          <section className="mt-4 flex flex-col gap-2">
            <h3 className="px-3 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              フィード
            </h3>
            <Link
              to="/app/articles"
              onClick={onClose}
              className="block truncate rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text)] no-underline hover:bg-[var(--surface-2)] hover:no-underline"
              activeProps={{
                className:
                  "block truncate rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] no-underline hover:no-underline",
              }}
            >
              すべての記事
            </Link>
            {feeds.length > 0 &&
              groups.map((group) => {
                const items = grouped.get(group.id) ?? [];
                if (items.length === 0) return null;
                const isCollapsed = collapsed.has(group.id);
                return (
                  <div key={group.id} className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(group.id)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-left text-[10px] font-medium tracking-wider text-[var(--text-muted)] uppercase hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    >
                      {isCollapsed ? (
                        <ChevronRight
                          className="h-3 w-3 shrink-0"
                          aria-hidden
                        />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{group.name}</span>
                      <span className="ml-1 font-normal text-[var(--text-muted)] normal-case">
                        ({items.length})
                      </span>
                    </button>
                    {!isCollapsed &&
                      items.map((f) => (
                        <FeedLink
                          key={f.id}
                          id={f.id}
                          title={f.title}
                          onNavigate={onClose}
                        />
                      ))}
                  </div>
                );
              })}
          </section>
        </div>
        <div className="border-t border-[var(--border)] p-3">
          <SidebarLink
            to="/app/settings"
            label="Settings"
            Icon={Settings}
            onNavigate={onClose}
          />
          <div className="mt-3 flex items-center justify-between px-3">
            <Link
              to="/"
              className="text-xs font-semibold tracking-wide text-[var(--text)] no-underline hover:text-[var(--accent-strong)] hover:no-underline"
              onClick={onClose}
            >
              Bookmark RSS
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}

interface SidebarLinkProps {
  to: NavTo;
  label: string;
  Icon: (typeof PRIMARY_NAV)[number]["icon"];
  onNavigate: () => void;
}

function SidebarLink({ to, label, Icon, onNavigate }: SidebarLinkProps) {
  const base =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline";
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`${base} text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] hover:no-underline`}
      activeProps={{
        className: `${base} bg-[var(--surface-2)] text-[var(--text)] hover:no-underline`,
      }}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

interface FeedLinkProps {
  id: string;
  title: string;
  onNavigate: () => void;
}

function FeedLink({ id, title, onNavigate }: FeedLinkProps) {
  const base = "block truncate rounded-md px-3 py-1.5 text-xs no-underline";
  return (
    <Link
      to="/app/feeds/$id"
      params={{ id }}
      onClick={onNavigate}
      title={title}
      className={`${base} text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] hover:no-underline`}
      activeProps={{
        className: `${base} bg-[var(--surface-2)] text-[var(--text)] hover:no-underline`,
      }}
    >
      {title}
    </Link>
  );
}
