import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { userPreference } from "@acme/db/schema";
import { encryptSecret } from "@acme/jobs";

import type { AppEnv } from "../env";

const DEFAULT_HOUR = 8;
const DISCORD_WEBHOOK_PREFIX = "https://discord.com/api/webhooks/";

const discordWebhookUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith(DISCORD_WEBHOOK_PREFIX), {
    message: "Must be a discord.com webhook URL",
  });

const patchSchema = z.object({
  recommendationEnabled: z.boolean().optional(),
  recommendationHour: z.number().int().min(0).max(23).optional(),
  discordWebhookUrl: discordWebhookUrlSchema.nullable().optional(),
});

interface PreferenceResponse {
  recommendationEnabled: boolean;
  recommendationHour: number;
  hasDiscordWebhook: boolean;
}

const toResponse = (
  row:
    | {
        recommendationEnabled: boolean;
        recommendationHour: number;
        discordWebhookUrlEncrypted: string | null;
      }
    | undefined,
): PreferenceResponse => ({
  recommendationEnabled: row?.recommendationEnabled ?? false,
  recommendationHour: row?.recommendationHour ?? DEFAULT_HOUR,
  hasDiscordWebhook: Boolean(row?.discordWebhookUrlEncrypted),
});

export const preferencesRouter = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const db = c.get("db");
    const row = await db
      .select({
        recommendationEnabled: userPreference.recommendationEnabled,
        recommendationHour: userPreference.recommendationHour,
        discordWebhookUrlEncrypted: userPreference.discordWebhookUrlEncrypted,
      })
      .from(userPreference)
      .where(eq(userPreference.userId, user.id))
      .get();
    return c.json(toResponse(row));
  })
  .patch(
    "/",
    zValidator("json", patchSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request body" }, 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const db = c.get("db");
      const masterKey = c.get("encryptionMasterKey");
      const patch = c.req.valid("json");

      let encryptedWebhook: string | null | undefined;
      if (patch.discordWebhookUrl === null) {
        encryptedWebhook = null;
      } else if (typeof patch.discordWebhookUrl === "string") {
        encryptedWebhook = await encryptSecret(
          patch.discordWebhookUrl,
          masterKey,
        );
      }

      const existing = await db
        .select()
        .from(userPreference)
        .where(eq(userPreference.userId, user.id))
        .get();

      if (existing) {
        const updates: Partial<typeof userPreference.$inferInsert> = {};
        if (patch.recommendationEnabled !== undefined) {
          updates.recommendationEnabled = patch.recommendationEnabled;
        }
        if (patch.recommendationHour !== undefined) {
          updates.recommendationHour = patch.recommendationHour;
        }
        if (encryptedWebhook !== undefined) {
          updates.discordWebhookUrlEncrypted = encryptedWebhook;
        }
        if (Object.keys(updates).length > 0) {
          await db
            .update(userPreference)
            .set(updates)
            .where(eq(userPreference.userId, user.id));
        }
      } else {
        await db.insert(userPreference).values({
          id: randomUUID(),
          userId: user.id,
          recommendationEnabled: patch.recommendationEnabled ?? false,
          recommendationHour: patch.recommendationHour ?? DEFAULT_HOUR,
          discordWebhookUrlEncrypted:
            encryptedWebhook === undefined ? null : encryptedWebhook,
        });
      }

      const row = await db
        .select({
          recommendationEnabled: userPreference.recommendationEnabled,
          recommendationHour: userPreference.recommendationHour,
          discordWebhookUrlEncrypted: userPreference.discordWebhookUrlEncrypted,
        })
        .from(userPreference)
        .where(eq(userPreference.userId, user.id))
        .get();
      return c.json(toResponse(row));
    },
  );
