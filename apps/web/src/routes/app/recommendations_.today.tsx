import { createFileRoute, useRouter } from "@tanstack/react-router";

import { makeApiClient } from "~/lib/api-client";

interface ArticleSummary {
  id: string;
  title: string;
  url: string;
  description: string | null;
  ogImageUrl: string | null;
  isRead: boolean;
}

interface FeedSummary {
  id: string;
  title: string;
  categoryName: string | null;
}

interface RecommendationItem {
  articleId: string;
  source: "ai" | "random";
  rank: number;
  reason: string | null;
  article: ArticleSummary;
  feed: FeedSummary;
}

interface RecommendationPayload {
  date: string;
  generatedAt: string;
  items: Array<RecommendationItem>;
}

type LoaderData =
  | { state: "ready"; data: RecommendationPayload }
  | { state: "empty" }
  | { state: "error"; status: number };

export const Route = createFileRoute("/app/recommendations_/today")({
  loader: async (): Promise<LoaderData> => {
    const api = makeApiClient();
    const res = await api.api.main.recommendations.today.$get();
    if (res.status === 404) {
      return { state: "empty" };
    }
    if (!res.ok) {
      return { state: "error", status: res.status };
    }
    const data = await res.json();
    return { state: "ready", data };
  },
  component: RecommendationsTodayPage,
});

function RecommendationsTodayPage() {
  const loader = Route.useLoaderData();
  const router = useRouter();

  const markArticleRead = (articleId: string, alreadyRead: boolean) => {
    if (alreadyRead) return;
    void (async () => {
      const api = makeApiClient();
      const res = await api.api.main.articles[":id"].$patch({
        param: { id: articleId },
        json: { isRead: true },
      });
      if (res.ok) {
        await router.invalidate();
      }
    })();
  };

  if (loader.state === "empty") {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold text-[var(--text)]">
          本日のおすすめ
        </h1>
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          まだ今日のおすすめは生成されていません。
          設定で通知時刻を確認してください。
        </div>
      </section>
    );
  }

  if (loader.state === "error") {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold text-[var(--text)]">
          本日のおすすめ
        </h1>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          読み込みに失敗しました (HTTP {loader.status})
        </div>
      </section>
    );
  }

  const { data } = loader;
  const aiItems = data.items.filter((i) => i.source === "ai");
  const randomItems = data.items.filter((i) => i.source === "random");

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-[var(--text)]">
          本日のおすすめ
        </h1>
        <p className="text-xs text-[var(--text-muted)]">{data.date} (JST)</p>
      </header>

      {aiItems.length > 0 && (
        <RecommendationSection
          title="AI セレクト"
          subtitle="興味関心に基づいて選ばれた記事"
          badgeLabel="AI"
          items={aiItems}
          showReason
          onOpen={markArticleRead}
        />
      )}

      {randomItems.length > 0 && (
        <RecommendationSection
          title="ランダム"
          subtitle="思いがけない出会いになるかもしれない記事"
          badgeLabel="Random"
          items={randomItems}
          showReason={false}
          onOpen={markArticleRead}
        />
      )}
    </section>
  );
}

function RecommendationSection({
  title,
  subtitle,
  badgeLabel,
  items,
  showReason,
  onOpen,
}: {
  title: string;
  subtitle: string;
  badgeLabel: string;
  items: Array<RecommendationItem>;
  showReason: boolean;
  onOpen: (articleId: string, alreadyRead: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <ul className="grid gap-3">
        {items.map((item) => {
          const { isRead } = item.article;
          return (
            <li
              key={item.articleId}
              className={
                isRead
                  ? "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 opacity-60 shadow-[var(--shadow-sm)]"
                  : "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"
              }
            >
              <div className="flex items-start gap-4">
                {item.article.ogImageUrl && (
                  <img
                    src={item.article.ogImageUrl}
                    alt=""
                    className="hidden h-20 w-32 flex-shrink-0 rounded-md border border-[var(--border)] object-cover sm:block"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {badgeLabel}
                    </span>
                    {isRead && (
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                        既読
                      </span>
                    )}
                    {item.feed.categoryName && (
                      <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {item.feed.categoryName}
                      </span>
                    )}
                    <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                      {item.feed.title}
                    </span>
                  </div>
                  <a
                    href={item.article.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onOpen(item.articleId, isRead)}
                    onAuxClick={() => onOpen(item.articleId, isRead)}
                    className={
                      isRead
                        ? "block text-base font-medium text-[var(--text-muted)] hover:underline"
                        : "block text-base font-semibold text-[var(--text)] hover:underline"
                    }
                  >
                    {item.article.title}
                  </a>
                  {item.article.description && (
                    <p className="line-clamp-2 text-sm text-[var(--text-muted)]">
                      {item.article.description}
                    </p>
                  )}
                  {showReason && item.reason && (
                    <p className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
                      {item.reason}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
