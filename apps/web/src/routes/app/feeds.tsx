import { useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";

import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

const UNCATEGORIZED = "__uncategorized__";

export const Route = createFileRoute("/app/feeds")({
  loader: async () => {
    const api = makeApiClient();
    const [feedsRes, categoriesRes] = await Promise.all([
      api.api.main.feeds.$get(),
      api.api.main.categories.$get(),
    ]);
    if (!feedsRes.ok) {
      return {
        feeds: [],
        categories: [],
        error: `HTTP ${feedsRes.status}`,
      };
    }
    return {
      feeds: await feedsRes.json(),
      categories: categoriesRes.ok ? await categoriesRes.json() : [],
      error: null as string | null,
    };
  },
  component: FeedsPage,
});

function FeedsPage() {
  const { feeds, categories, error } = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const allIds = useMemo(() => feeds.map((f) => f.id), [feeds]);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryError, setEditingCategoryError] = useState<
    string | null
  >(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof feeds>();
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const api = makeApiClient();
      const res = await api.api.main.feeds.$post({ json: { url } });
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
      title: "フィードを削除しますか?",
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.feeds[":id"].$delete({ param: { id } });
    if (!res.ok) {
      toast.error(`削除失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  const onImport = async (file: File) => {
    setImporting(true);
    setImportMessage(null);
    try {
      const opml = await file.text();
      const api = makeApiClient();
      const res = await api.api.main.feeds.import.$post({ json: { opml } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setImportMessage({
          type: "error",
          text: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const result = await res.json();
      setImportMessage({
        type: "success",
        text: `${result.imported} 件追加 / ${result.skipped} 件スキップ (合計 ${result.total} 件)`,
      });
      await router.invalidate();
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  const onBulkUpdateCategory = async (raw: string) => {
    if (raw === "") return;
    const ids = [...selected];
    if (ids.length === 0) return;
    const categoryId = raw === UNCATEGORIZED ? null : raw;
    const categoryName =
      categoryId === null
        ? "未分類"
        : (categories.find((c) => c.id === categoryId)?.name ?? "");
    const ok = await confirm({
      title: `${ids.length} 件のフィードを「${categoryName}」に変更しますか?`,
      confirmLabel: "変更",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.feeds["bulk-update-category"].$post({
      json: { ids, categoryId },
    });
    if (!res.ok) {
      toast.error(`変更失敗: HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    toast.success(`${body.updated} 件を「${categoryName}」に変更しました`);
    setSelected(new Set());
    await router.invalidate();
  };

  const onBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `${ids.length} 件のフィードを削除しますか?`,
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const api = makeApiClient();
      const res = await api.api.main.feeds["bulk-delete"].$post({
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

  const onAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setSavingCategory(true);
    setCategoryError(null);
    try {
      const api = makeApiClient();
      const res = await api.api.main.categories.$post({ json: { name } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setCategoryError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setNewCategoryName("");
      await router.invalidate();
    } finally {
      setSavingCategory(false);
    }
  };

  const startEditingCategory = (id: string, currentName: string) => {
    setEditingCategoryId(id);
    setEditingCategoryName(currentName);
    setEditingCategoryError(null);
  };

  const cancelEditingCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingCategoryError(null);
  };

  const saveEditingCategory = async (id: string, originalName: string) => {
    const name = editingCategoryName.trim();
    if (!name || name === originalName) {
      cancelEditingCategory();
      return;
    }
    const api = makeApiClient();
    const res = await api.api.main.categories[":id"].$patch({
      param: { id },
      json: { name },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setEditingCategoryError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    cancelEditingCategory();
    await router.invalidate();
  };

  const onDeleteCategory = async (id: string) => {
    const ok = await confirm({
      title: "カテゴリを削除しますか?",
      message: "紐付いているフィードは未分類になります。",
      destructive: true,
      confirmLabel: "削除",
    });
    if (!ok) return;
    const api = makeApiClient();
    const res = await api.api.main.categories[":id"].$delete({
      param: { id },
    });
    if (!res.ok) {
      toast.error(`削除失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  const onChangeFeedCategory = async (feedId: string, raw: string) => {
    const categoryId = raw === UNCATEGORIZED ? null : raw;
    const api = makeApiClient();
    const res = await api.api.main.feeds[":id"].$patch({
      param: { id: feedId },
      json: { categoryId },
    });
    if (!res.ok) {
      toast.error(`カテゴリ変更失敗: HTTP ${res.status}`);
      return;
    }
    await router.invalidate();
  };

  return (
    <div className="space-y-6">
      <Card title="フィードを追加">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="url"
            required
            placeholder="https://example.com/rss"
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
            {submitting ? "追加中..." : "追加"}
          </button>
        </form>
        {formError && (
          <p className="mt-2 text-sm text-[var(--danger)]">{formError}</p>
        )}
      </Card>

      <Card title="OPML からインポート">
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml,application/xml,text/xml"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
          }}
          className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--text)] hover:file:bg-[var(--accent-soft)]"
        />
        {importing && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            インポート中...
          </p>
        )}
        {importMessage && (
          <p
            className={`mt-2 text-sm ${
              importMessage.type === "error"
                ? "text-[var(--danger)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {importMessage.text}
          </p>
        )}
      </Card>

      <Card title="カテゴリ">
        <form onSubmit={onAddCategory} className="flex gap-2">
          <input
            type="text"
            placeholder="新しいカテゴリ名"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            disabled={savingCategory}
            className="flex-1 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={savingCategory || !newCategoryName.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            追加
          </button>
        </form>
        {categoryError && (
          <p className="mt-2 text-sm text-[var(--danger)]">{categoryError}</p>
        )}
        {categories.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => {
              const isEditing = editingCategoryId === c.id;
              return (
                <li
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs"
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEditingCategory(c.id, c.name);
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editingCategoryName}
                        onChange={(e) =>
                          setEditingCategoryName(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditingCategory();
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
                        onClick={cancelEditingCategory}
                        className="text-[var(--text-muted)]"
                        title="キャンセル"
                      >
                        ×
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="text-[var(--text)]">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => startEditingCategory(c.id, c.name)}
                        className="text-[var(--text-muted)] hover:text-[var(--accent-strong)]"
                        title="リネーム"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(c.id)}
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
        {editingCategoryError && (
          <p className="mt-2 text-sm text-[var(--danger)]">
            {editingCategoryError}
          </p>
        )}
      </Card>

      <Card title="フィード一覧">
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {feeds.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            フィードはまだ登録されていません。
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                全選択
              </label>
              <div className="flex items-center gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    void onBulkUpdateCategory(e.target.value);
                    e.target.value = "";
                  }}
                  disabled={selected.size === 0}
                  className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
                  aria-label="選択をカテゴリ変更"
                >
                  <option value="" disabled>
                    カテゴリ変更...
                  </option>
                  <option value={UNCATEGORIZED}>未分類</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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

            <div className="space-y-5">
              {[...categories, { id: UNCATEGORIZED, name: "未分類" }].map(
                (group) => {
                  const items = grouped.get(group.id) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={group.id}>
                      <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                        {group.name}
                        <span className="ml-2 font-normal text-[var(--text-muted)]">
                          ({items.length})
                        </span>
                      </h3>
                      <ul className="divide-y divide-[var(--border)]">
                        {items.map((f) => (
                          <li
                            key={f.id}
                            className="flex items-center gap-3 py-3"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(f.id)}
                              onChange={() => toggleOne(f.id)}
                              className="h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                            />
                            <div className="min-w-0 flex-1">
                              <Link
                                to="/app/feeds/$id"
                                params={{ id: f.id }}
                                className="block truncate text-sm font-medium text-[var(--text)] no-underline hover:text-[var(--accent-strong)]"
                              >
                                {f.title}
                              </Link>
                              <p className="truncate text-xs text-[var(--text-muted)]">
                                {f.url}
                              </p>
                            </div>
                            <select
                              value={f.categoryId ?? UNCATEGORIZED}
                              onChange={(e) =>
                                onChangeFeedCategory(f.id, e.target.value)
                              }
                              className="shrink-0 rounded-md px-2 py-1 text-xs"
                            >
                              <option value={UNCATEGORIZED}>未分類</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => onDelete(f.id)}
                              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                            >
                              削除
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                },
              )}
            </div>
          </>
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
