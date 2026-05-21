import { SignJWT, importPKCS8 } from "jose";

export class VertexGeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VertexGeminiError";
  }
}

export interface VertexGeminiConfig {
  projectId: string;
  location: string;
  model: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
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

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const fetchAccessToken = async (
  config: VertexGeminiConfig,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<string> => {
  const privateKey = await importPKCS8(
    config.serviceAccountPrivateKey,
    "RS256",
  );
  const nowSec = Math.floor(nowMs / 1000);
  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(config.serviceAccountEmail)
    .setSubject(config.serviceAccountEmail)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 3600)
    .sign(privateKey);

  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    throw new VertexGeminiError(
      `Failed to obtain GCP access token (HTTP ${res.status})`,
    );
  }
  const body = (await res.json()) as { access_token?: string };
  if (typeof body.access_token !== "string") {
    throw new VertexGeminiError("GCP token response missing access_token");
  }
  return body.access_token;
};

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
    "以下の JSON のみを返してください (前置きや説明、 コードブロックの ```json などは含めない):",
    '[ { "id": "<候補のid>", "reason": "<日本語で1〜2文の理由>" } ]',
  ].join("\n");
};

const stripJsonFences = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
};

const parsePicks = (raw: unknown): RecommendationPick[] => {
  if (!Array.isArray(raw)) {
    throw new VertexGeminiError("Model output is not an array");
  }
  const picks: RecommendationPick[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const id = (item as { id?: unknown }).id;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof id !== "string") {
      continue;
    }
    picks.push({
      articleId: id,
      reason: typeof reason === "string" ? reason : "",
    });
  }
  return picks;
};

export const createVertexGeminiClient = (config: VertexGeminiConfig) => {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;
  return {
    async generateRecommendations(
      params: GenerateRecommendationsParams,
    ): Promise<RecommendationPick[]> {
      const accessToken = await fetchAccessToken(config, fetchImpl, now());
      const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}:generateContent`;
      const prompt = buildPrompt(params);
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!res.ok) {
        throw new VertexGeminiError(
          `Vertex AI generateContent failed (HTTP ${res.status})`,
        );
      }
      const body = (await res.json()) as GeminiResponse;
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new VertexGeminiError(
          "Vertex AI response missing candidates[].content.parts[].text",
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripJsonFences(text));
      } catch {
        throw new VertexGeminiError(
          `Model output is not valid JSON: ${text.slice(0, 120)}`,
        );
      }
      const allPicks = parsePicks(parsed);
      const candidateIds = new Set(params.candidates.map((c) => c.id));
      const filtered = allPicks.filter((p) => candidateIds.has(p.articleId));
      return filtered.slice(0, params.count);
    },
  };
};

export type VertexGeminiClient = ReturnType<typeof createVertexGeminiClient>;
