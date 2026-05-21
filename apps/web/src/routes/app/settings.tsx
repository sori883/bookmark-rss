import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

const IOS_SHORTCUT_CLIENT_ID = "bookmark-ios";

interface Preferences {
  recommendationEnabled: boolean;
  recommendationHour: number;
  hasDiscordWebhook: boolean;
}

export const Route = createFileRoute("/app/settings")({
  loader: async () => {
    const api = makeApiClient();
    const res = await api.api.main.preferences.$get();
    if (!res.ok) {
      return {
        preferences: {
          recommendationEnabled: false,
          recommendationHour: 8,
          hasDiscordWebhook: false,
        } as Preferences,
        error: `HTTP ${res.status}` as string | null,
      };
    }
    const preferences = await res.json();
    return { preferences, error: null as string | null };
  },
  component: SettingsPage,
});

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function SettingsPage() {
  const { preferences } = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [enabled, setEnabled] = useState(preferences.recommendationEnabled);
  const [hour, setHour] = useState(preferences.recommendationHour);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    const api = makeApiClient();
    const trimmed = webhookUrl.trim();
    const patch: {
      recommendationEnabled: boolean;
      recommendationHour: number;
      discordWebhookUrl?: string;
    } = {
      recommendationEnabled: enabled,
      recommendationHour: hour,
    };
    if (trimmed.length > 0) {
      patch.discordWebhookUrl = trimmed;
    }
    const res = await api.api.main.preferences.$patch({ json: patch });
    setSubmitting(false);
    if (res.ok) {
      toast.success("設定を更新しました");
      setWebhookUrl("");
      await router.invalidate();
    } else if (res.status === 400) {
      toast.error(
        "入力内容に問題があります。Discord Webhook URL は https://discord.com/api/webhooks/ で始まる必要があります。",
      );
    } else {
      toast.error(`更新に失敗しました (HTTP ${res.status})`);
    }
  };

  const handleDeleteWebhook = async () => {
    const ok = await confirm({
      title: "Discord 連携を解除しますか?",
      message:
        "保存済みの Discord Webhook URL を削除します。再度通知を受け取るには URL の再設定が必要です。",
      confirmLabel: "解除",
      destructive: true,
    });
    if (!ok) return;
    setSubmitting(true);
    const api = makeApiClient();
    const res = await api.api.main.preferences.$patch({
      json: { discordWebhookUrl: null },
    });
    setSubmitting(false);
    if (res.ok) {
      toast.info("Discord 連携を解除しました");
      await router.invalidate();
    } else {
      toast.error(`更新に失敗しました (HTTP ${res.status})`);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">設定</h1>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 text-lg font-semibold text-[var(--text)]">
          レコメンド通知
        </h2>
        <p className="mb-5 text-xs text-[var(--text-muted)]">
          毎日決まった時刻 (JST) に、 過去 24 時間の未読記事から AI が選んだ 5
          件 + ランダム 5 件のおすすめを生成します。
        </p>

        <label className="mb-5 flex items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text)]">
            毎日レコメンドを生成する
          </span>
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
            通知時刻 (JST)
          </span>
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            disabled={!enabled}
            className="w-32 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        <div className="mb-5">
          <span className="mb-1 block text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
            Discord Webhook URL
          </span>
          {preferences.hasDiscordWebhook ? (
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                設定済み
              </span>
              <button
                type="button"
                onClick={() => void handleDeleteWebhook()}
                disabled={submitting}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
              >
                連携を解除
              </button>
            </div>
          ) : (
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          )}
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            毎日のおすすめを指定 Discord チャンネルに送信します。 URL
            は暗号化して保存します。
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {submitting ? "保存中..." : "保存"}
        </button>
      </div>

      <IosShortcutSection />
    </section>
  );
}

interface DeviceCodePayload {
  device_code: string;
  user_code: string;
}

interface DeviceTokenPayload {
  access_token: string;
}

const issueIosShortcutToken = async (): Promise<string> => {
  const codeRes = await fetch("/api/auth/device/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ client_id: IOS_SHORTCUT_CLIENT_ID }),
  });
  if (!codeRes.ok) {
    throw new Error(`device/code failed (HTTP ${codeRes.status})`);
  }
  const code: DeviceCodePayload = await codeRes.json();

  const approveRes = await fetch("/api/auth/device/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userCode: code.user_code }),
  });
  if (!approveRes.ok) {
    throw new Error(`device/approve failed (HTTP ${approveRes.status})`);
  }

  const tokenRes = await fetch("/api/auth/device/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: code.device_code,
      client_id: IOS_SHORTCUT_CLIENT_ID,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`device/token failed (HTTP ${tokenRes.status})`);
  }
  const token: DeviceTokenPayload = await tokenRes.json();
  return token.access_token;
};

function IosShortcutSection() {
  const toast = useToast();
  const [issuing, setIssuing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const endpoint =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/main/bookmarks`;

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const t = await issueIosShortcutToken();
      setToken(t);
      setRevealed(true);
      toast.success("トークンを発行しました。 コピーしてショートカットに貼り付けてください。");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "トークン発行に失敗しました");
    } finally {
      setIssuing(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} をコピーしました`);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
      <h2 className="mb-1 text-lg font-semibold text-[var(--text)]">
        iOS ショートカット連携
      </h2>
      <p className="mb-5 text-xs text-[var(--text-muted)]">
        iPhone の共有メニューからブックマークを追加するための長期トークンを発行します。
        画面を離れると再表示できないので、 ショートカットに貼り付けるまで閉じないでください。
        失くした場合は再発行できます。
      </p>

      {token ? (
        <div className="mb-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
              アクセストークン
            </span>
            <div className="flex items-center gap-2">
              <input
                type={revealed ? "text" : "password"}
                value={token}
                readOnly
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              >
                {revealed ? "隠す" : "表示"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy(token, "トークン")}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
              >
                コピー
              </button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
              エンドポイント
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={endpoint}
                readOnly
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => void handleCopy(endpoint, "エンドポイント")}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              >
                コピー
              </button>
            </div>
          </label>
          <button
            type="button"
            onClick={() => void handleIssue()}
            disabled={issuing}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
          >
            {issuing ? "発行中..." : "再発行"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleIssue()}
          disabled={issuing}
          className="mb-5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {issuing ? "発行中..." : "ショートカット用トークンを発行"}
        </button>
      )}

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]">
        <h3 className="mb-2 text-sm font-semibold">ショートカットの作り方</h3>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--text-muted)]">
          <li>iPhone で「ショートカット」 App を開き、 右上の + で新規作成。</li>
          <li>i ボタン → 「共有シートに表示」 をオン、 受け付ける種類を「URL」 のみに絞る。</li>
          <li>
            アクション「URL の内容を取得」 を追加し、 URL を上の「エンドポイント」 にする。
          </li>
          <li>
            同アクションを展開し、 メソッドを <code>POST</code>、 ヘッダに
            <code> Authorization: Bearer 上のトークン</code> と
            <code> Content-Type: application/json</code> を追加。
          </li>
          <li>
            本文を「JSON」、 キー <code>url</code> の値を「ショートカットの入力 (URL)」 に設定。
          </li>
          <li>
            最後に「通知を表示」 アクションを追加して任意のメッセージを設定。
          </li>
          <li>
            ショートカット名を「ブックマーク追加」 等に変更して保存。 Safari で共有 → 作成したショートカットで動作確認。
          </li>
        </ol>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          トークンが漏れた場合や端末を紛失した場合は、 再発行 (新しいトークンを発行) で対応してください。
          現状の実装では「過去のトークンだけを失効」 する UI はまだありません。
        </p>
      </div>
    </div>
  );
}
