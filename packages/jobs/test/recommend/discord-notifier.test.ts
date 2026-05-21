import { describe, expect, it, vi } from "vitest";

import {
  DiscordNotifierError,
  DiscordWebhookGoneError,
  DiscordWebhookRateLimitedError,
  sendRecommendationDiscord,
} from "../../src/recommend/discord-notifier";

const baseParams = () => ({
  webhookUrl: "https://discord.com/api/webhooks/123/abc",
  date: "2026-05-22",
  webPageUrl: "https://example.com/app/recommendations/today",
  aiItems: [
    {
      title: "TypeScript 6 の型推論",
      url: "https://example.com/ts6",
      reason: "最近 TypeScript の話題を多く読んでいるため",
    },
  ],
  randomItems: [
    { title: "Rust GAT 入門", url: "https://example.com/rust-gat" },
    { title: "go 1.25 のマップ", url: "https://example.com/go-1-25" },
  ],
});

describe("sendRecommendationDiscord", () => {
  it("posts a JSON body to the configured webhook URL", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await sendRecommendationDiscord(baseParams(), fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/123/abc",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("includes the date, AI items with reasons, and random items in the embed", async () => {
    interface CapturedBody {
      embeds: { title: string; description: string; url: string }[];
    }
    const calls: CapturedBody[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      const raw = typeof init?.body === "string" ? init.body : "{}";
      calls.push(JSON.parse(raw) as CapturedBody);
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    await sendRecommendationDiscord(baseParams(), fetchImpl);

    const body = calls[0];
    if (!body) {
      throw new Error("expected fetch to have been called");
    }
    expect(body.embeds).toHaveLength(1);
    const embed = body.embeds[0];
    if (!embed) {
      throw new Error("expected at least one embed");
    }
    expect(embed.title).toContain("2026-05-22");
    expect(embed.url).toBe("https://example.com/app/recommendations/today");
    expect(embed.description).toContain("TypeScript 6 の型推論");
    expect(embed.description).toContain(
      "最近 TypeScript の話題を多く読んでいるため",
    );
    expect(embed.description).toContain("Rust GAT 入門");
    expect(embed.description).toContain("go 1.25 のマップ");
  });

  it("resolves silently on 200 or 204", async () => {
    const status200 = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    await expect(
      sendRecommendationDiscord(baseParams(), status200),
    ).resolves.toBeUndefined();
    const status204 = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      sendRecommendationDiscord(baseParams(), status204),
    ).resolves.toBeUndefined();
  });

  it("throws DiscordWebhookGoneError on 404 (webhook deleted)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(
      sendRecommendationDiscord(baseParams(), fetchImpl),
    ).rejects.toThrow(DiscordWebhookGoneError);
  });

  it("throws DiscordWebhookRateLimitedError on 429", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(
      sendRecommendationDiscord(baseParams(), fetchImpl),
    ).rejects.toThrow(DiscordWebhookRateLimitedError);
  });

  it("throws DiscordNotifierError on unexpected non-2xx responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(
      sendRecommendationDiscord(baseParams(), fetchImpl),
    ).rejects.toThrow(DiscordNotifierError);
  });
});
