import { Link, createFileRoute, useRouter } from "@tanstack/react-router";

import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

export const Route = createFileRoute("/app/feeds_/$id")({
  loader: async ({ params }) => {
    const api = makeApiClient();
    const [feedRes, articlesRes] = await Promise.all([
      api.api.main.feeds[":id"].$get({ param: { id: params.id } }),
      api.api.main.articles.$get({ query: { feedId: params.id } }),
    ]);
    if (!feedRes.ok) {
      return {
        feed: null,
        articles: [] as Array<{
          id: string;
          url: string;
          title: string;
          isRead: boolean;
          publishedAt: string | null;
          ogImageUrl: string | null;
        }>,
        error: `HTTP ${feedRes.status}` as string | null,
      };
    }
    const articles = articlesRes.ok ? (await articlesRes.json()).items : [];
    return {
      feed: await feedRes.json(),
      articles,
      error: null as string | null,
    };
  },
  component: FeedDetailPage,
});

function FeedDetailPage() {
  const { feed, articles, error } = Route.useLoaderData();
  const router = useRouter();
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

  if (error || !feed) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <Link to="/app/feeds" className="text-sm">
          ← フィード一覧へ
        </Link>
        <p className="mt-3 text-sm text-[var(--danger)]">
          {error ?? "Not found"}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <Link to="/app/feeds" className="text-xs">
          ← フィード一覧へ
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-[var(--text)]">
          {feed.title}
        </h1>
        {feed.siteUrl && (
          <a
            href={feed.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--text-muted)]"
          >
            {feed.siteUrl}
          </a>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
          記事一覧
        </h2>
        {articles.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            記事はまだ取得されていません。
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {articles.map((a) => (
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
                  {a.publishedAt && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {new Date(a.publishedAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleRead(a.id, !a.isRead)}
                  className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]"
                >
                  {a.isRead ? "未読に戻す" : "既読にする"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
