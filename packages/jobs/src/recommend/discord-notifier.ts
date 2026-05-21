export class DiscordNotifierError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DiscordNotifierError";
    this.status = status;
  }
}

export class DiscordWebhookGoneError extends DiscordNotifierError {
  constructor() {
    super("Discord webhook returned 404 (deleted by the user)", 404);
    this.name = "DiscordWebhookGoneError";
  }
}

export class DiscordWebhookRateLimitedError extends DiscordNotifierError {
  constructor() {
    super("Discord webhook returned 429 (rate limited)", 429);
    this.name = "DiscordWebhookRateLimitedError";
  }
}

export interface RecommendationEmbedItem {
  title: string;
  url: string;
  reason?: string;
}

export interface SendRecommendationParams {
  webhookUrl: string;
  date: string;
  webPageUrl: string;
  aiItems: RecommendationEmbedItem[];
  randomItems: RecommendationEmbedItem[];
}

const ACCENT_COLOR = 0x2563eb;

const renderItems = (
  items: RecommendationEmbedItem[],
  withReason: boolean,
): string =>
  items
    .map((item) => {
      const reason = withReason && item.reason ? `\n  ${item.reason}` : "";
      return `• [${item.title}](${item.url})${reason}`;
    })
    .join("\n");

const buildDescription = (
  aiItems: RecommendationEmbedItem[],
  randomItems: RecommendationEmbedItem[],
): string => {
  const sections: string[] = [];
  if (aiItems.length > 0) {
    sections.push(`🤖 **AI セレクト**\n${renderItems(aiItems, true)}`);
  }
  if (randomItems.length > 0) {
    sections.push(`🎲 **ランダム**\n${renderItems(randomItems, false)}`);
  }
  return sections.join("\n\n");
};

export const sendRecommendationDiscord = async (
  params: SendRecommendationParams,
  fetchImpl: typeof fetch = fetch,
): Promise<void> => {
  const body = {
    embeds: [
      {
        title: `本日のおすすめ (${params.date})`,
        url: params.webPageUrl,
        color: ACCENT_COLOR,
        description: buildDescription(params.aiItems, params.randomItems),
        footer: { text: "bookmark-rss" },
      },
    ],
  };
  const res = await fetchImpl(params.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 200 || res.status === 204) {
    return;
  }
  if (res.status === 404) {
    throw new DiscordWebhookGoneError();
  }
  if (res.status === 429) {
    throw new DiscordWebhookRateLimitedError();
  }
  throw new DiscordNotifierError(
    `Discord webhook failed (HTTP ${res.status})`,
    res.status,
  );
};
