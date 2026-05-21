import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { userPreference } from "@acme/db/schema";
import { decryptSecret } from "@acme/jobs";

import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { buildTestApp } from "./helpers/app";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

interface PreferencesResponse {
  recommendationEnabled: boolean;
  recommendationHour: number;
  hasDiscordWebhook: boolean;
}

describe("GET /preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/preferences");
    expect(res.status).toBe(401);
  });

  it("returns sensible defaults when no row exists", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreferencesResponse;
    expect(body).toEqual({
      recommendationEnabled: false,
      recommendationHour: 8,
      hasDiscordWebhook: false,
    });
  });

  it("returns hasDiscordWebhook=true when an encrypted URL is stored", async () => {
    await db.insert(userPreference).values({
      id: "p1",
      userId: user.id,
      recommendationEnabled: true,
      recommendationHour: 21,
      discordWebhookUrlEncrypted: "stored-ciphertext",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences");
    const body = (await res.json()) as PreferencesResponse;
    expect(body).toEqual({
      recommendationEnabled: true,
      recommendationHour: 21,
      hasDiscordWebhook: true,
    });
  });

  it("never returns the webhook URL itself", async () => {
    await db.insert(userPreference).values({
      id: "p1",
      userId: user.id,
      discordWebhookUrlEncrypted: "stored-ciphertext",
    });
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences");
    const body = await res.text();
    expect(body).not.toContain("stored-ciphertext");
    expect(body).not.toContain("discordWebhookUrl");
  });
});

describe("PATCH /preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ db, user: null });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationEnabled: true }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a preference row on first update", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recommendationEnabled: true,
        recommendationHour: 18,
      }),
    });
    expect(res.status).toBe(200);
    const row = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, user.id))
      .get();
    expect(row?.recommendationEnabled).toBe(true);
    expect(row?.recommendationHour).toBe(18);
  });

  it("updates an existing preference row", async () => {
    await db.insert(userPreference).values({
      id: "p1",
      userId: user.id,
      recommendationEnabled: false,
      recommendationHour: 8,
    });
    const app = buildTestApp({ db, user });
    await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationHour: 23 }),
    });
    const row = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, user.id))
      .get();
    expect(row?.recommendationHour).toBe(23);
    expect(row?.recommendationEnabled).toBe(false);
  });

  it("encrypts the discord webhook URL before persisting it", async () => {
    const url = "https://discord.com/api/webhooks/123/abc";
    const app = buildTestApp({ db, user, encryptionMasterKey: TEST_KEY });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discordWebhookUrl: url }),
    });
    expect(res.status).toBe(200);
    const row = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, user.id))
      .get();
    const stored = row?.discordWebhookUrlEncrypted ?? null;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("discord.com");
    if (!stored) {
      throw new Error("unreachable: stored ciphertext missing");
    }
    expect(await decryptSecret(stored, TEST_KEY)).toBe(url);
  });

  it("clears the discord webhook when null is passed", async () => {
    await db.insert(userPreference).values({
      id: "p1",
      userId: user.id,
      discordWebhookUrlEncrypted: "existing",
    });
    const app = buildTestApp({ db, user });
    await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discordWebhookUrl: null }),
    });
    const row = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, user.id))
      .get();
    expect(row?.discordWebhookUrlEncrypted).toBeNull();
  });

  it("returns 400 for hour out of range", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationHour: 24 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-Discord webhook URL", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        discordWebhookUrl: "https://evil.example.com/hook",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns the latest state in the response body", async () => {
    const app = buildTestApp({ db, user });
    const res = await app.request("/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recommendationEnabled: true,
        recommendationHour: 6,
        discordWebhookUrl: "https://discord.com/api/webhooks/9/x",
      }),
    });
    const body = (await res.json()) as PreferencesResponse;
    expect(body).toEqual({
      recommendationEnabled: true,
      recommendationHour: 6,
      hasDiscordWebhook: true,
    });
  });
});
