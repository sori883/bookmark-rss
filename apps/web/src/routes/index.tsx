import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "~/auth/client";
import { makeApiClient } from "~/lib/api-client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const api = makeApiClient();
    const res = await api.api.main.me.$get();
    if (res.ok) {
      throw redirect({ to: "/app/feeds" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const handleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/app/feeds",
    });
  };

  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="h-1.5 w-full bg-[var(--accent)]" />
        <div className="p-8">
          <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]">
            Bookmark RSS
          </h1>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            RSS フィードを購読してブックマークを管理します。
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
          >
            Google でサインイン
          </button>
        </div>
      </div>
    </main>
  );
}
