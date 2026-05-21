import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import type { CurrentTab } from "./bookmark-view";
import { BASE_URL } from "../../src/config";
import { addBookmark } from "../../src/lib/bookmark-client";
import { trySessionAuth } from "../../src/lib/session-auth";
import { clearToken, getToken } from "../../src/lib/token-storage";
import { BookmarkView } from "./bookmark-view";

type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; token: string };

const queryActiveTab = async (): Promise<CurrentTab | null> => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    return null;
  }
  return { url: tab.url, title: tab.title };
};

const openLoginPage = () => {
  void browser.tabs.create({ url: `${BASE_URL}/` });
  window.close();
};

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [tab, setTab] = useState<CurrentTab | null>(null);

  useEffect(() => {
    void (async () => {
      const currentTab = await queryActiveTab();
      setTab(currentTab);

      const ok = await trySessionAuth({ authBaseUrl: BASE_URL });
      if (ok) {
        const refreshed = await getToken();
        if (refreshed) {
          setAuth({ kind: "authenticated", token: refreshed });
          return;
        }
      }
      await clearToken();
      setAuth({ kind: "anonymous" });
    })();
  }, []);

  if (auth.kind === "loading") {
    return (
      <div className="flex min-h-[160px] items-center justify-center p-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (auth.kind === "anonymous") {
    return (
      <section className="flex flex-col gap-4 p-5">
        <header className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
          <h1 className="text-sm font-semibold tracking-wide text-slate-700">
            bookmark-rss
          </h1>
        </header>
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-900">
            サインインが必要です
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Web でログイン後、もう一度このアイコンをクリックしてください。
          </p>
        </div>
        <button
          type="button"
          onClick={openLoginPage}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          ログインページを開く
        </button>
      </section>
    );
  }

  return (
    <BookmarkView
      currentTab={tab}
      onAdd={(url) =>
        addBookmark({ baseUrl: BASE_URL, token: auth.token, url })
      }
      onUnauthorized={async () => {
        await clearToken();
        setAuth({ kind: "anonymous" });
      }}
    />
  );
}
