import { Link, createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { makeApiClient } from "~/lib/api-client";

export const Route = createFileRoute("/app/bookmarks_/$id")({
  loader: async ({ params }) => {
    const api = makeApiClient();
    const res = await api.api.main.bookmarks[":id"].$get({
      param: { id: params.id },
    });
    if (!res.ok) {
      return { bookmark: null, error: `HTTP ${res.status}` };
    }
    return { bookmark: await res.json(), error: null as string | null };
  },
  component: BookmarkDetailPage,
});

function BookmarkDetailPage() {
  const { bookmark, error } = Route.useLoaderData();

  if (error || !bookmark) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <Link to="/app/bookmarks" className="text-sm">
          ← ブックマーク一覧へ
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
        <Link to="/app/bookmarks" className="text-xs">
          ← ブックマーク一覧へ
        </Link>
        <div className="mt-3 flex items-start gap-4">
          {bookmark.ogImageUrl ? (
            <img
              src={bookmark.ogImageUrl}
              alt=""
              loading="lazy"
              className="h-24 w-36 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-[var(--text)]">
              {bookmark.title}
            </h1>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-xs text-[var(--text-muted)]"
            >
              {bookmark.url}
            </a>
            {bookmark.description && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {bookmark.description}
              </p>
            )}
            {bookmark.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {bookmark.tags.map((t) => (
                  <Link
                    key={t.id}
                    to="/app/bookmarks"
                    search={{ tagId: t.id }}
                    className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-strong)] no-underline"
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        {bookmark.contentMarkdown ? (
          <article className="prose prose-sm md:prose-base prose-headings:text-[var(--text)] prose-p:text-[var(--text)] prose-strong:text-[var(--text)] prose-li:text-[var(--text)] prose-blockquote:text-[var(--text-muted)] prose-blockquote:border-l-[var(--border-strong)] prose-a:text-[var(--accent-strong)] prose-code:text-[var(--accent-strong)] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[var(--surface-2)] prose-pre:text-[var(--text)] prose-hr:border-[var(--border)] prose-th:text-[var(--text)] prose-td:text-[var(--text)] max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {bookmark.contentMarkdown}
            </ReactMarkdown>
          </article>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            本文を取得中です。数秒後にリロードしてください。
          </p>
        )}
      </section>
    </div>
  );
}
