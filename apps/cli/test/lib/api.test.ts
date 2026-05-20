import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NotLoggedInError, requireAuthedClient } from "../../src/lib/api.ts";
import { saveConfig } from "../../src/lib/config.ts";

let tempHome: string;
let originalHome: string | undefined;
let originalApiUrl: string | undefined;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "bookmark-cli-"));
  originalHome = process.env.HOME;
  originalApiUrl = process.env.BOOKMARK_API_URL;
  process.env.HOME = tempHome;
  process.env.BOOKMARK_API_URL = "https://api.example.com";
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  if (originalApiUrl === undefined) {
    delete process.env.BOOKMARK_API_URL;
  } else {
    process.env.BOOKMARK_API_URL = originalApiUrl;
  }
  await rm(tempHome, { recursive: true, force: true });
});

describe("requireAuthedClient", () => {
  it("throws NotLoggedInError when no config exists", async () => {
    await expect(requireAuthedClient()).rejects.toThrow(NotLoggedInError);
  });

  it("returns a client when token is present", async () => {
    await saveConfig({ token: "tok" });
    const { client, config } = await requireAuthedClient();
    expect(client).toBeDefined();
    expect(config.token).toBe("tok");
  });
});
