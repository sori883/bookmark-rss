import { z } from "zod";

import { createDbClient } from "@acme/db/client";
import { createVertexGeminiClient, runDailyRecommendJob } from "@acme/jobs";

interface Env {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  ENCRYPTION_MASTER_KEY: string;
  GCP_PROJECT_ID: string;
  VERTEX_AI_LOCATION: string;
  VERTEX_AI_MODEL: string;
  CF_ACCOUNT_ID: string;
  CF_AI_GATEWAY_ID: string;
  CF_AI_GATEWAY_TOKEN: string;
  WEB_BASE_URL: string;
}

const PicksSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
}

const buildAiGatewayUrl = (env: Env): string =>
  `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}/google-vertex-ai/v1/projects/${env.GCP_PROJECT_ID}/locations/${env.VERTEX_AI_LOCATION}/publishers/google/models/${env.VERTEX_AI_MODEL}:generateContent`;

const buildGeminiClient = (env: Env) => {
  const url = buildAiGatewayUrl(env);
  return createVertexGeminiClient({
    generate: async (prompt) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}`,
          "content-type": "application/json",
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
        const detail = await res.text().catch(() => "");
        throw new Error(
          `AI Gateway -> Vertex AI returned HTTP ${res.status}: ${detail.slice(0, 200)}`,
        );
      }
      const body: GeminiResponse = await res.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new Error(
          "Vertex AI response missing candidates[].content.parts[].text",
        );
      }
      const parsed: unknown = JSON.parse(text);
      return PicksSchema.parse(parsed);
    },
  });
};

const runRecommend = async (env: Env): Promise<void> => {
  const db = createDbClient({
    url: env.DATABASE_URL,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN,
  });
  const gemini = buildGeminiClient(env);
  const result = await runDailyRecommendJob({
    db,
    gemini,
    encryptionMasterKey: env.ENCRYPTION_MASTER_KEY,
    webBaseUrl: env.WEB_BASE_URL,
  });
  console.log(
    `[recommend] processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`,
  );
};

export default {
  scheduled(_event, env, ctx) {
    ctx.waitUntil(runRecommend(env));
  },
} satisfies ExportedHandler<Env>;
