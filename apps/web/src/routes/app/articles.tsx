import { useEffect, useMemo, useState } from "react";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

const UNCATEGORIZED_PARAM = "none";

interface ArticlesSearch {
  // undefined (= default) も true も「未読のみ」、 明示的に false の時だけ「すべて」を表示。
  unread?: boolean;
  categoryId?: string;
  page?: number;
}

const validateSearch = (search: Record<string, unknown>): ArticlesSearch => {
  const rawPage = search.page;
  const page =
    typeof rawPage === "number" && Number.isInteger(rawPage) && rawPage >= 1
      ? rawPage
      : undefined;
  return {
    unread: search.unread === false ? false : undefined,
    categoryId:
      typeof search.categoryId === "string" && search.categoryId.length > 0
        ? search.categoryId
        : undefined,
    page,
  };
};

export const Route = createFileRoute("/app/articles")({
  validateSearch,
  loaderDeps: ({ search }) => ({
    unread: search.unread,
    categoryId: search.categoryId,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const api = makeApiClient();
    const showAll = deps.unread === false;
    const query: { unread?: "true"; categoryId?: string; page?: string } = {};
    if (!showAll) query.unread = "true";
    if (deps.categoryId) query.categoryId = deps.categoryId;
    if (deps.page && deps.page > 1) query.page = String(deps.page);
    const [articlesRes, feedsRes, categoriesRes] = await Promise.all([
      api.api.main.articles.$get({ query }),
      api.api.main.feeds.$get(),
      api.api.main.categories.$get(),
    ]);
    if (!articlesRes.ok) {
      return {
        articles: [] as Array<{
          id: string;
          feedId: string;
          url: string;
          title: string;
          description: string | null;
          ogImageUrl: string | null;
          isRead: boolean;
          publishedAt: string | null;
        }>,
        total: 0,
        page: 1,
        perPage: 50,
        feedsById: {} as Record<string, { title: string }>,
        categories: [] as Array<{ id: string; name: string }>,
        error: `HTTP ${articlesRes.status}` as string | null,
      };
    }
    const payload = await articlesRes.json();
    const feeds = feedsRes.ok ? await feedsRes.json() : [];
    const categories = categoriesRes.ok ? await categoriesRes.json() : [];
    const feedsById = Object.fromEntries(
      feeds.map((f) => [f.id, { title: f.title }]),
    );
    return {
      articles: payload.items,
      total: payload.total,
      page: payload.page,
      perPage: payload.perPage,
      feedsById,
      categories,
      error: null as string | null,
    };
  },
  component: ArticlesPage,
});

function ArticlesPage() {
  const { articles, total, page, perPage, feedsById, categories, error } =
    Route.useLoaderData();
  const search = Route.useSearch();
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const hasPrev = page > 1;
  const hasNext = page < pageCount;
  const router = useRouter();
  const navigate = useNavigate({ from: "/app/articles" });
  const toast = useToast();
  const confirm = useConfirm();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMarking, setBulkMarking] = useState(false);
  const allIds = useMemo(() => articles.map((a) => a.id), [articles]);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => selected.has(id));
  useEffect(() => {
    setSelected(new Set());
  }, [search.page, search.categoryId, search.unread]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(allIds));
  };

  const onBulkMarkRead = async () => {
    const articleIds = [...selected];
    if (articleIds.length === 0) return;
    const ok = await confirm({
      title: `${articleIds.length} 件の記事を既読にしますか?`,
      confirmLabel: "既読にする",
    });
    if (!ok) return;
    setBulkMarking(true);
    try {
      const api = makeApiClient();
      const res = await api.api.main.articles["bulk-mark-read"].$post({
        json: { articleIds },
      });
      if (!res.ok) {
        toast.error(`既読化失敗: HTTP ${res.status}`);
        return;
      }
      const body = await res.json();
      toast.success(`${body.updated} 件の記事を既読にしました`);
      setSelected(new Set());
      await router.invalidate();
    } finally {
      setBulkMarking(false);
    }
  };

  const toggleRead = async (id: string, next: boolean) => {
    const api = makeApiClient();
    const res = await api.api.main.articles[":id"].$patch({
      param: { id },
      json: { isRead: next },
    });
    if (!res.ok) {
      toast.error(`更新失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  const markReadOnOpen = (id: string, alreadyRead: boolean) => {
    if (alreadyRead) return;
    void (async () => {
      const api = makeApiClient();
      const res = await api.api.main.articles[":id"].$patch({
        param: { id },
        json: { isRead: true },
      });
      if (res.ok) {
        await router.invalidate();
      }
    })();
  };

  const onChangeCategory = (raw: string) => {
    const categoryId = raw === "" ? undefined : raw;
    void navigate({
      // Changing the filter should reset pagination.
      search: (prev) => ({ ...prev, categoryId, page: undefined }),
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">記事一覧</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={search.categoryId ?? ""}
              onChange={(e) => onChangeCategory(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
              aria-label="カテゴリで絞り込み"
            >
              <option value="">すべてのカテゴリ</option>
              <option value={UNCATEGORIZED_PARAM}>未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5 text-xs">
              <Link
                to="/app/articles"
                search={(prev) => ({
                  ...prev,
                  unread: undefined,
                  page: undefined,
                })}
                className={
                  search.unread === false
                    ? "rounded px-3 py-1 text-[var(--text-muted)] no-underline"
                    : "rounded bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent-strong)] no-underline"
                }
              >
                未読のみ
              </Link>
              <Link
                to="/app/articles"
                search={(prev) => ({
                  ...prev,
                  unread: false,
                  page: undefined,
                })}
                className={
                  search.unread === false
                    ? "rounded bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent-strong)] no-underline"
                    : "rounded px-3 py-1 text-[var(--text-muted)] no-underline"
                }
              >
                すべて
              </Link>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

        {articles.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {search.unread === false
              ? "記事はまだ取得されていません。フィードを追加するか、しばらく待ってからもう一度確認してください。"
              : "未読の記事はありません。"}
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                このページを全選択
              </label>
              <button
                type="button"
                onClick={onBulkMarkRead}
                disabled={selected.size === 0 || bulkMarking}
                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] enabled:hover:border-[var(--accent)] enabled:hover:bg-[var(--accent-soft)] enabled:hover:text-[var(--accent-strong)] disabled:opacity-50"
              >
                {bulkMarking ? "既読化中..." : `選択を既読 (${selected.size})`}
              </button>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {articles.map((a) => {
                const feedTitle = feedsById[a.feedId]?.title;
                return (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 py-3 last:pb-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                      aria-label={`${a.title} を選択`}
                    />
                    {a.ogImageUrl && (
                      <img
                        src={a.ogImageUrl}
                        alt=""
                        loading="lazy"
                        className="hidden h-16 w-24 flex-shrink-0 rounded-md border border-[var(--border)] object-cover sm:block"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markReadOnOpen(a.id, a.isRead)}
                        onAuxClick={() => markReadOnOpen(a.id, a.isRead)}
                        className={
                          a.isRead
                            ? "block text-sm text-[var(--text-muted)] no-underline"
                            : "block text-sm font-medium text-[var(--text)] no-underline"
                        }
                      >
                        {a.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-muted)]">
                        {feedTitle && (
                          <Link
                            to="/app/feeds/$id"
                            params={{ id: a.feedId }}
                            className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
                          >
                            {feedTitle}
                          </Link>
                        )}
                        {a.publishedAt && (
                          <span>
                            {new Date(a.publishedAt).toLocaleString("ja-JP")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRead(a.id, !a.isRead)}
                      className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]"
                    >
                      {a.isRead ? "未読に戻す" : "既読にする"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {total > perPage && (
          <nav className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
            <span>
              {page} / {pageCount} ページ・全 {total} 件
            </span>
            <div className="flex gap-2">
              <Link
                to="/app/articles"
                search={(prev) => ({
                  ...prev,
                  page: page > 2 ? page - 1 : undefined,
                })}
                disabled={!hasPrev}
                className={
                  hasPrev
                    ? "rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text)] no-underline hover:bg-[var(--surface-2)]"
                    : "pointer-events-none rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text-muted)] opacity-50"
                }
              >
                ← 前へ
              </Link>
              <Link
                to="/app/articles"
                search={(prev) => ({ ...prev, page: page + 1 })}
                disabled={!hasNext}
                className={
                  hasNext
                    ? "rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text)] no-underline hover:bg-[var(--surface-2)]"
                    : "pointer-events-none rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text-muted)] opacity-50"
                }
              >
                次へ →
              </Link>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
