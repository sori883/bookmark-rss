import { useState } from "react";

import type { AddBookmarkResult } from "../../src/lib/bookmark-client";

export interface CurrentTab {
  url: string;
  title?: string;
}

export interface BookmarkViewProps {
  currentTab: CurrentTab | null;
  onAdd: (url: string) => Promise<AddBookmarkResult>;
  onUnauthorized: () => void;
}

type ViewState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

const errorMessage = (
  result: Extract<AddBookmarkResult, { ok: false }>,
): string => {
  if (result.reason === "fetch-failed") {
    return "ページを取得できませんでした";
  }
  if (result.reason === "unknown") {
    return `通信エラー (status ${result.status})`;
  }
  return result.reason;
};

export function BookmarkView({
  currentTab,
  onAdd,
  onUnauthorized,
}: BookmarkViewProps) {
  const [state, setState] = useState<ViewState>({ kind: "idle" });

  const handleAdd = async () => {
    if (!currentTab) {
      return;
    }
    setState({ kind: "saving" });
    const result = await onAdd(currentTab.url);
    if (result.ok) {
      setState({ kind: "saved" });
      return;
    }
    if (result.reason === "already-exists") {
      setState({ kind: "duplicate" });
      return;
    }
    if (result.reason === "unauthorized") {
      onUnauthorized();
      return;
    }
    setState({ kind: "error", message: errorMessage(result) });
  };

  return (
    <section className="flex flex-col gap-4 p-5">
      <header className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
        <h1 className="text-sm font-semibold tracking-wide text-slate-700">
          bookmark-rss
        </h1>
      </header>

      {currentTab ? (
        <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {currentTab.title && (
            <p className="line-clamp-2 text-sm font-medium text-slate-900">
              {currentTab.title}
            </p>
          )}
          <p className="line-clamp-1 text-xs break-all text-slate-500">
            {currentTab.url}
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
          アクティブなタブが見つかりません
        </p>
      )}

      {state.kind === "idle" && (
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!currentTab}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ブックマークに追加
        </button>
      )}

      {state.kind === "saving" && (
        <div className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          追加中...
        </div>
      )}

      {state.kind === "saved" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-700">
          Added!
        </div>
      )}

      {state.kind === "duplicate" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-700">
          Already bookmarked
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-center text-sm font-medium text-rose-700"
        >
          {state.message}
        </div>
      )}
    </section>
  );
}
