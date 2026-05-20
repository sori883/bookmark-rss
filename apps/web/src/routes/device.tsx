import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { authClient } from "~/auth/client";
import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

interface DeviceSearch {
  user_code?: string;
}

const validateSearch = (search: Record<string, unknown>): DeviceSearch => ({
  user_code:
    typeof search.user_code === "string" && search.user_code.length > 0
      ? search.user_code
      : undefined,
});

export const Route = createFileRoute("/device")({
  validateSearch,
  loaderDeps: ({ search }) => ({ user_code: search.user_code }),
  loader: async () => {
    const api = makeApiClient();
    const res = await api.api.main.me.$get();
    if (!res.ok) {
      return { isAuthed: false } as const;
    }
    const user = await res.json();
    if (!user) {
      return { isAuthed: false } as const;
    }
    return { isAuthed: true } as const;
  },
  component: DevicePage,
});

function DevicePage() {
  const { isAuthed } = Route.useLoaderData();
  const { user_code: initialCode } = Route.useSearch();

  if (!isAuthed) {
    return <SignInPrompt />;
  }
  return <ApprovalPanel initialCode={initialCode ?? ""} />;
}

function SignInPrompt() {
  const handleSignIn = async () => {
    const callbackURL =
      typeof window === "undefined"
        ? "/device"
        : window.location.pathname + window.location.search;
    await authClient.signIn.social({ provider: "google", callbackURL });
  };
  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="h-1.5 w-full bg-[var(--accent)]" />
        <div className="p-8">
          <h1 className="mb-2 text-xl font-semibold text-[var(--text)]">
            デバイス承認
          </h1>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            続けるにはサインインしてください。
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

type Status = "idle" | "submitting" | "approved" | "denied";

const submitDevice = async (
  endpoint: "approve" | "deny",
  userCode: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const res = await fetch(`/api/auth/device/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userCode }),
  });
  if (res.ok) {
    return { ok: true };
  }
  const body = (await res.json().catch(() => null)) as
    | { error_description?: string; message?: string }
    | null;
  return {
    ok: false,
    message:
      body?.error_description ?? body?.message ?? `HTTP ${res.status}`,
  };
};

function ApprovalPanel({ initialCode }: { initialCode: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<Status>("idle");

  const cleanCode = code.replace(/-/g, "").trim();
  const canSubmit = cleanCode.length > 0 && status === "idle";

  const handleApprove = async () => {
    const ok = await confirm({
      title: "デバイスを承認しますか?",
      message: `コード ${code || cleanCode} を承認します。`,
      confirmLabel: "承認",
    });
    if (!ok) return;
    setStatus("submitting");
    const result = await submitDevice("approve", code);
    if (result.ok) {
      setStatus("approved");
      toast.success("承認しました。CLI に戻ってください。");
    } else {
      setStatus("idle");
      toast.error(result.message);
    }
  };

  const handleDeny = async () => {
    const ok = await confirm({
      title: "デバイスを拒否しますか?",
      message: `コード ${code || cleanCode} を拒否します。`,
      confirmLabel: "拒否",
      destructive: true,
    });
    if (!ok) return;
    setStatus("submitting");
    const result = await submitDevice("deny", code);
    if (result.ok) {
      setStatus("denied");
      toast.info("拒否しました。");
    } else {
      setStatus("idle");
      toast.error(result.message);
    }
  };

  if (status === "approved") {
    return (
      <ResultPanel
        title="承認しました"
        message="CLI に戻ってください。このタブは閉じて構いません。"
      />
    );
  }
  if (status === "denied") {
    return (
      <ResultPanel
        title="拒否しました"
        message="CLI へのアクセスを拒否しました。"
      />
    );
  }

  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="h-1.5 w-full bg-[var(--accent)]" />
        <div className="p-8">
          <h1 className="mb-2 text-xl font-semibold text-[var(--text)]">
            デバイス承認
          </h1>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            CLI が要求しているコードを確認して承認してください。
          </p>
          <label className="mb-2 block text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
            ユーザーコード
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            autoFocus={!initialCode}
            disabled={status === "submitting"}
            className="mb-6 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center font-mono text-lg tracking-widest text-[var(--text)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDeny}
              disabled={!canSubmit}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              拒否
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={!canSubmit}
              className="flex-1 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              承認
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ResultPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
        <h1 className="mb-3 text-xl font-semibold text-[var(--text)]">
          {title}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">{message}</p>
      </div>
    </main>
  );
}
