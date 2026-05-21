export class VertexGeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VertexGeminiError";
  }
}

export interface GenerateRecommendationsParams {
  bookmarks: { title: string; description: string | null }[];
  candidates: { id: string; title: string; description: string | null }[];
  count: number;
}

export interface RecommendationPick {
  articleId: string;
  reason: string;
}

interface RawPicks {
  picks: { id: string; reason: string }[];
}

export interface CreateVertexGeminiClientConfig {
  /**
   * Wrapper around the underlying LLM call. Receives the built prompt and
   * must return a parsed object that matches { picks: [{ id, reason }] }.
   *
   * In production this is wired to ai-sdk's generateObject with a zod schema
   * (see apps/worker-ai/src/index.ts). Tests can pass any stub function and
   * skip the network entirely.
   */
  generate: (prompt: string) => Promise<RawPicks>;
}

const buildPrompt = ({
  bookmarks,
  candidates,
  count,
}: GenerateRecommendationsParams): string => {
  const bookmarkLines = bookmarks
    .map((b) => `- ${b.title}${b.description ? ` — ${b.description}` : ""}`)
    .join("\n");
  const candidateLines = candidates
    .map(
      (c) =>
        `- id=${c.id} | ${c.title}${c.description ? ` — ${c.description}` : ""}`,
    )
    .join("\n");
  return [
    "あなたは記事キュレーターです。",
    `ユーザーがブックマークした記事から興味関心を読み取り、未読の候補記事から特に気に入りそうな記事を ${count} 件選んでください。`,
    "",
    "[ユーザーのブックマーク (興味関心の参考)]",
    bookmarkLines || "(ブックマークなし)",
    "",
    "[未読候補記事]",
    candidateLines,
    "",
    "picks 配列で id (上記候補の id) と reason (日本語1〜2文) を返してください。",
  ].join("\n");
};

export const createVertexGeminiClient = (
  config: CreateVertexGeminiClientConfig,
) => ({
  async generateRecommendations(
    params: GenerateRecommendationsParams,
  ): Promise<RecommendationPick[]> {
    let result: RawPicks;
    try {
      result = await config.generate(buildPrompt(params));
    } catch (err) {
      throw new VertexGeminiError(
        `Vertex AI generate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const candidateIds = new Set(params.candidates.map((c) => c.id));
    return result.picks
      .filter((p) => candidateIds.has(p.id))
      .map((p) => ({ articleId: p.id, reason: p.reason }))
      .slice(0, params.count);
  },
});

export type VertexGeminiClient = ReturnType<typeof createVertexGeminiClient>;
