import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { useConfirm } from "~/components/Confirm";
import { useToast } from "~/components/Toast";
import { makeApiClient } from "~/lib/api-client";

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
    </section>
  );
}
