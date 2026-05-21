import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

const UNCATEGORIZED_PARAM = "none";

interface ArticlesSearch {
  unread?: boolean;
  categoryId?: string;
}

const validateSearch = (search: Record<string, unknown>): ArticlesSearch => ({
  unread: search.unread === true,
  categoryId:
    typeof search.categoryId === "string" && search.categoryId.length > 0
      ? search.categoryId
      : undefined,
});

export const Route = createFileRoute("/app/articles")({
  validateSearch,
  loaderDeps: ({ search }) => ({
    unread: search.unread,
    categoryId: search.categoryId,
  }),
  loader: async ({ deps }) => {
    const api = makeApiClient();
    const query: { unread?: "true"; categoryId?: string } = {};
    if (deps.unread) query.unread = "true";
    if (deps.categoryId) query.categoryId = deps.categoryId;
    const [articlesRes, feedsRes, categoriesRes] = await Promise.all([
      api.api.main.articles.$get({ query }),
      api.api.main.feeds.$get(),
      api.api.main.categories.$get(),
    ]);
    if (!articlesRes.ok) {
      return {
        articles: [],
        feedsById: {} as Record<string, { title: string }>,
        categories: [] as Array<{ id: string; name: string }>,
        error: `HTTP ${articlesRes.status}`,
      };
    }
    const articles = await articlesRes.json();
    const feeds = feedsRes.ok ? await feedsRes.json() : [];
    const categories = categoriesRes.ok ? await categoriesRes.json() : [];
    const feedsById = Object.fromEntries(
      feeds.map((f) => [f.id, { title: f.title }]),
    );
    return {
      articles,
      feedsById,
      categories,
      error: null as string | null,
    };
  },
  component: ArticlesPage,
});

function ArticlesPage() {
  const { articles, feedsById, categories, error } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: "/app/articles" });
  const toast = useToast();

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

  const onChangeCategory = (raw: string) => {
    const categoryId = raw === "" ? undefined : raw;
    void navigate({
      search: (prev) => ({ ...prev, categoryId }),
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
                search={(prev) => ({ ...prev, unread: undefined })}
                className="rounded px-3 py-1 text-[var(--text-muted)] no-underline"
                activeOptions={{ exact: true, includeSearch: true }}
                activeProps={{
                  className:
                    "rounded bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent-strong)] no-underline",
                }}
              >
                すべて
              </Link>
              <Link
                to="/app/articles"
                search={(prev) => ({ ...prev, unread: true })}
                className="rounded px-3 py-1 text-[var(--text-muted)] no-underline"
                activeOptions={{ exact: true, includeSearch: true }}
                activeProps={{
                  className:
                    "rounded bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent-strong)] no-underline",
                }}
              >
                未読のみ
              </Link>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

        {articles.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {search.unread
              ? "未読の記事はありません。"
              : "記事はまだ取得されていません。フィードを追加するか、しばらく待ってからもう一度確認してください。"}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {articles.map((a) => {
              const feedTitle = feedsById[a.feedId]?.title;
              return (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
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
        )}
      </section>
    </div>
  );
}
