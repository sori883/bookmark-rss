import { createVertex } from "@ai-sdk/google-vertex/edge";
import { generateObject } from "ai";
import { z } from "zod";

import { createDbClient } from "@acme/db/client";
import { createVertexGeminiClient, runDailyRecommendJob } from "@acme/jobs";

interface Env {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN: string;
  ENCRYPTION_MASTER_KEY: string;
  GCP_PROJECT_ID: string;
  GCP_SERVICE_ACCOUNT_EMAIL: string;
  GCP_SERVICE_ACCOUNT_PRIVATE_KEY: string;
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

const buildGeminiClient = (env: Env) => {
  const vertex = createVertex({
    project: env.GCP_PROJECT_ID,
    location: env.VERTEX_AI_LOCATION,
    googleCredentials: {
      clientEmail: env.GCP_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY,
    },
    baseURL: `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}/google-vertex-ai/v1/projects/${env.GCP_PROJECT_ID}/locations/${env.VERTEX_AI_LOCATION}/publishers/google`,
    headers: {
      "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}`,
    },
  });
  const model = vertex(env.VERTEX_AI_MODEL);
  return createVertexGeminiClient({
    generate: async (prompt) => {
      const { object } = await generateObject({
        model,
        schema: PicksSchema,
        prompt,
        temperature: 0.4,
      });
      return object;
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
