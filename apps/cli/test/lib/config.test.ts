import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearConfig,
  getConfigPath,
  loadConfig,
  saveConfig,
} from "../../src/lib/config.ts";

let tempHome: string;
let originalHome: string | undefined;
let originalXdg: string | undefined;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "bookmark-cli-"));
  originalHome = process.env.HOME;
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = tempHome;
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  if (originalXdg !== undefined) {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
  await rm(tempHome, { recursive: true, force: true });
});

describe("getConfigPath", () => {
  it("defaults to ~/.config/bookmark-rss/config.json", () => {
    expect(getConfigPath()).toBe(
      join(tempHome, ".config", "bookmark-rss", "config.json"),
    );
  });

  it("honors XDG_CONFIG_HOME", () => {
    const xdg = join(tempHome, "xdg");
    process.env.XDG_CONFIG_HOME = xdg;
    expect(getConfigPath()).toBe(join(xdg, "bookmark-rss", "config.json"));
  });
});

describe("loadConfig", () => {
  it("returns null when no config file exists", async () => {
    expect(await loadConfig()).toBeNull();
  });

  it("reads back a saved token", async () => {
    await saveConfig({ token: "tok-1" });
    expect(await loadConfig()).toEqual({ token: "tok-1" });
  });

  it("returns null when file is malformed", async () => {
    await saveConfig({ token: "x" });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(getConfigPath(), "not json", { mode: 0o600 });
    expect(await loadConfig()).toBeNull();
  });

  it("returns null when token is missing", async () => {
    const { writeFile } = await import("node:fs/promises");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(join(tempHome, ".config", "bookmark-rss"), { recursive: true }),
    );
    await writeFile(getConfigPath(), JSON.stringify({ foo: "bar" }), {
      mode: 0o600,
    });
    expect(await loadConfig()).toBeNull();
  });
});

describe("saveConfig", () => {
  it("creates parent directories", async () => {
    await saveConfig({ token: "tok" });
    const raw = await readFile(getConfigPath(), "utf8");
    expect(JSON.parse(raw)).toEqual({ token: "tok" });
  });

  it("writes the file with 0600 permissions", async () => {
    await saveConfig({ token: "secret" });
    const s = await stat(getConfigPath());
    expect(s.mode & 0o777).toBe(0o600);
  });

  it("overwrites existing config", async () => {
    await saveConfig({ token: "t1" });
    await saveConfig({ token: "t2" });
    expect(await loadConfig()).toEqual({ token: "t2" });
  });

  it("tightens permissions on an existing 0644 file", async () => {
    const {
      mkdir,
      writeFile,
      chmod: fsChmod,
    } = await import("node:fs/promises");
    const path = getConfigPath();
    await mkdir(join(tempHome, ".config", "bookmark-rss"), {
      recursive: true,
    });
    await writeFile(path, JSON.stringify({ token: "old" }), { mode: 0o644 });
    await fsChmod(path, 0o644);
    expect((await stat(path)).mode & 0o777).toBe(0o644);

    await saveConfig({ token: "new" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

describe("clearConfig", () => {
  it("removes the config file", async () => {
    await saveConfig({ token: "t" });
    await clearConfig();
    expect(await loadConfig()).toBeNull();
  });

  it("is a no-op when no config exists", async () => {
    await expect(clearConfig()).resolves.toBeUndefined();
  });
});
