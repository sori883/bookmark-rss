import { buildRecommendationPrompt } from "./recommend-prompt";

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

export const createVertexGeminiClient = (
  config: CreateVertexGeminiClientConfig,
) => ({
  async generateRecommendations(
    params: GenerateRecommendationsParams,
  ): Promise<RecommendationPick[]> {
    let result: RawPicks;
    try {
      result = await config.generate(buildRecommendationPrompt(params));
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
