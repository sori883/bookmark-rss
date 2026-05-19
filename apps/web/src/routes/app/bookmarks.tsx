import { useMemo, useState } from "react";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

interface BookmarksSearch {
  tagId?: string;
  q?: string;
}

const validateSearch = (
  search: Record<string, unknown>,
): BookmarksSearch => ({
  tagId:
    typeof search.tagId === "string" && search.tagId.length > 0
      ? search.tagId
      : undefined,
  q:
    typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
});

export const Route = createFileRoute("/app/bookmarks")({
  validateSearch,
  loaderDeps: ({ search }) => ({ tagId: search.tagId, q: search.q }),
  loader: async ({ deps }) => {
    const api = makeApiClient();
    const query: { tagId?: string; q?: string } = {};
    if (deps.tagId) query.tagId = deps.tagId;
    if (deps.q) query.q = deps.q;
    const [bookmarksRes, tagsRes] = await Promise.all([
      api.api.main.bookmarks.$get({ query }),
      api.api.main.tags.$get(),
    ]);
    if (!bookmarksRes.ok) {
      return {
        bookmarks: [],
        tags: [] as Array<{ id: string; name: string }>,
        error: `HTTP ${bookmarksRes.status}`,
      };
    }
    return {
      bookmarks: await bookmarksRes.json(),
      tags: tagsRes.ok ? await tagsRes.json() : [],
      error: null as string | null,
    };
  },
  component: BookmarksPage,
});

function BookmarksPage() {
  const { bookmarks, tags, error } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: "/app/bookmarks" });
  const toast = useToast();
  const confirm = useConfirm();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const allIds = useMemo(() => bookmarks.map((b) => b.id), [bookmarks]);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingTagError, setEditingTagError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const api = makeApiClient();
      const res = await api.api.main.bookmarks.$post({ json: { url } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setFormError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setUrl("");
      await router.invalidate();
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: "ブックマークを削除しますか?",
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.bookmarks[":id"].$delete({ param: { id } });
    if (!res.ok) {
      toast.error(`削除失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

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

  const onBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `${ids.length} 件のブックマークを削除しますか?`,
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const api = makeApiClient();
      const res = await api.api.main.bookmarks["bulk-delete"].$post({
        json: { ids },
      });
      if (!res.ok) {
        toast.error(`削除失敗: HTTP ${res.status}`);
        return;
      }
      setSelected(new Set());
      await router.invalidate();
    } finally {
      setBulkDeleting(false);
    }
  };

  const onAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    setTagError(null);
    const api = makeApiClient();
    const res = await api.api.main.tags.$post({ json: { name } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setTagError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setNewTagName("");
    await router.invalidate();
  };

  const onDeleteTag = async (id: string) => {
    const ok = await confirm({
      title: "タグを削除しますか?",
      message: "ブックマークからタグが外れます。",
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.tags[":id"].$delete({ param: { id } });
    if (!res.ok) {
      toast.error(`削除失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  const startEditingTag = (id: string, name: string) => {
    setEditingTagId(id);
    setEditingTagName(name);
    setEditingTagError(null);
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditingTagName("");
    setEditingTagError(null);
  };

  const saveEditingTag = async (id: string, originalName: string) => {
    const name = editingTagName.trim();
    if (!name || name === originalName) {
      cancelEditingTag();
      return;
    }
    const api = makeApiClient();
    const res = await api.api.main.tags[":id"].$patch({
      param: { id },
      json: { name },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setEditingTagError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    cancelEditingTag();
    await router.invalidate();
  };

  const onChangeFilterTag = (raw: string) => {
    void navigate({
      search: (prev) => ({ ...prev, tagId: raw === "" ? undefined : raw }),
    });
  };

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    void navigate({
      search: (prev) => ({ ...prev, q: q.length > 0 ? q : undefined }),
    });
  };

  const onClearSearch = () => {
    setSearchInput("");
    void navigate({ search: (prev) => ({ ...prev, q: undefined }) });
  };

  const onSetBookmarkTags = async (bookmarkId: string, tagIds: Array<string>) => {
    const api = makeApiClient();
    const res = await api.api.main.bookmarks[":id"].$patch({
      param: { id: bookmarkId },
      json: { tagIds },
    });
    if (!res.ok) {
      toast.error(`タグ更新失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  const onAddTagToBookmark = (bookmarkId: string, tagId: string) => {
    if (!tagId) return;
    const target = bookmarks.find((b) => b.id === bookmarkId);
    if (!target) return;
    const current = target.tags.map((t) => t.id);
    if (current.includes(tagId)) return;
    void onSetBookmarkTags(bookmarkId, [...current, tagId]);
  };

  const onRemoveTagFromBookmark = (bookmarkId: string, tagId: string) => {
    const target = bookmarks.find((b) => b.id === bookmarkId);
    if (!target) return;
    void onSetBookmarkTags(
      bookmarkId,
      target.tags.map((t) => t.id).filter((id) => id !== tagId),
    );
  };

  const onBulkAddTag = async (rawTagId: string) => {
    if (!rawTagId) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    const tagName = tags.find((t) => t.id === rawTagId)?.name ?? "";
    const ok = await confirm({
      title: `${ids.length} 件のブックマークに「${tagName}」を追加しますか?`,
      confirmLabel: "追加",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.bookmarks["bulk-add-tags"].$post({
      json: { ids, tagIds: [rawTagId] },
    });
    if (!res.ok) {
      toast.error(`タグ付与失敗: HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    toast.success(
      `${body.updated} 件に「${tagName}」を追加 (${body.added} 件の新規付与)`,
    );
    setSelected(new Set());
    await router.invalidate();
  };

  return (
    <div className="space-y-6">
      <Card title="ブックマークを追加">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="url"
            required
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
            className="flex-1 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {submitting ? "取得中..." : "追加"}
          </button>
        </form>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          タイトル・サムネイルはページの OGP から自動取得します。
        </p>
        {formError && (
          <p className="mt-2 text-sm text-[var(--danger)]">{formError}</p>
        )}
      </Card>

      <Card title="タグ">
        <form onSubmit={onAddTag} className="flex gap-2">
          <input
            type="text"
            placeholder="新しいタグ名"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="flex-1 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newTagName.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            追加
          </button>
        </form>
        {tagError && (
          <p className="mt-2 text-sm text-[var(--danger)]">{tagError}</p>
        )}
        {tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((t) => {
              const isEditing = editingTagId === t.id;
              return (
                <li
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs"
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEditingTag(t.id, t.name);
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditingTag();
                        }}
                        className="w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs"
                      />
                      <button
                        type="submit"
                        className="text-[var(--accent-strong)]"
                        title="保存"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingTag}
                        className="text-[var(--text-muted)]"
                        title="キャンセル"
                      >
                        ×
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="text-[var(--text)]">#{t.name}</span>
                      <button
                        type="button"
                        onClick={() => startEditingTag(t.id, t.name)}
                        className="text-[var(--text-muted)] hover:text-[var(--accent-strong)]"
                        title="リネーム"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTag(t.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        title="削除"
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editingTagError && (
          <p className="mt-2 text-sm text-[var(--danger)]">{editingTagError}</p>
        )}
      </Card>

      <Card title="ブックマーク一覧">
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <form onSubmit={onSubmitSearch} className="mb-3 flex gap-2">
          <input
            type="search"
            placeholder="タイトル・説明・本文を検索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
          >
            検索
          </button>
          {search.q && (
            <button
              type="button"
              onClick={onClearSearch}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            >
              クリア
            </button>
          )}
        </form>
        {search.q && (
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            「{search.q}」の検索結果: {bookmarks.length} 件
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={bookmarks.length === 0}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
              />
              全選択
            </label>
            <span className="ml-2">タグで絞り込み:</span>
            <select
              value={search.tagId ?? ""}
              onChange={(e) => onChangeFilterTag(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
            >
              <option value="">すべて</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => {
                void onBulkAddTag(e.target.value);
                e.target.value = "";
              }}
              disabled={selected.size === 0 || tags.length === 0}
              className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
              aria-label="選択にタグを追加"
            >
              <option value="" disabled>
                タグを追加...
              </option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={selected.size === 0 || bulkDeleting}
              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] enabled:hover:border-[var(--danger)] enabled:hover:bg-[var(--danger-soft)] enabled:hover:text-[var(--danger)] disabled:opacity-50"
            >
              {bulkDeleting ? "削除中..." : `選択を削除 (${selected.size})`}
            </button>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {search.tagId
              ? "このタグが付いたブックマークはありません。"
              : "ブックマークはまだありません。"}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {bookmarks.map((b) => {
              const remainingTags = tags.filter(
                (t) => !b.tags.some((bt) => bt.id === t.id),
              );
              return (
                <li
                  key={b.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggleOne(b.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  {b.ogImageUrl ? (
                    <img
                      src={b.ogImageUrl}
                      alt=""
                      loading="lazy"
                      className="h-16 w-24 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-16 w-24 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/app/bookmarks/$id"
                        params={{ id: b.id }}
                        className="block min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)] no-underline hover:text-[var(--accent-strong)]"
                      >
                        {b.title}
                      </Link>
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--accent-strong)]"
                        title="元ページを開く"
                      >
                        ↗
                      </a>
                    </div>
                    {b.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {b.description}
                      </p>
                    )}
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                      {b.url}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {b.tags.map((t) => (
                        <Link
                          key={t.id}
                          to="/app/bookmarks"
                          search={{ tagId: t.id }}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-strong)] no-underline"
                        >
                          #{t.name}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onRemoveTagFromBookmark(b.id, t.id);
                            }}
                            className="text-current opacity-60 hover:opacity-100"
                            aria-label="タグを外す"
                          >
                            ×
                          </button>
                        </Link>
                      ))}
                      {remainingTags.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            onAddTagToBookmark(b.id, e.target.value);
                            e.target.value = "";
                          }}
                          className="rounded-md px-2 py-0.5 text-xs"
                          aria-label="タグを追加"
                        >
                          <option value="" disabled>
                            + タグ
                          </option>
                          {remainingTags.map((t) => (
                            <option key={t.id} value={t.id}>
                              #{t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(b.id)}
                    className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}
