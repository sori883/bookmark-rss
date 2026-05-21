import { z } from "zod";

import { createDbClient } from "@acme/db/client";
import { createVertexGeminiClient, runDailyRecommendJob } from "@acme/jobs";

interface Env {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  ENCRYPTION_MASTER_KEY: string;
  WEB_BASE_URL: string;
  CF_AI_GATEWAY_ID: string;
  AI: Ai;
}

const MODEL = "google/gemini-3.1-flash-lite";

const PicksSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
}

const buildGeminiClient = (env: Env) =>
  createVertexGeminiClient({
    generate: async (prompt) => {
      const response = (await env.AI.run(
        MODEL,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        },
        { gateway: { id: env.CF_AI_GATEWAY_ID } },
      )) as GeminiResponse;
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new Error(
          "Workers AI response missing candidates[].content.parts[].text",
        );
      }
      const parsed: unknown = JSON.parse(text);
      return PicksSchema.parse(parsed);
    },
  });

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
