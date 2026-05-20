import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CliConfig {
  token: string;
}

const APP_DIR = "bookmark-rss";
const FILE = "config.json";

export const getConfigPath = (): string => {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, APP_DIR, FILE);
};

export const loadConfig = async (): Promise<CliConfig | null> => {
  const path = getConfigPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { token?: unknown }).token !== "string"
    ) {
      return null;
    }
    return { token: (parsed as { token: string }).token };
  } catch {
    return null;
  }
};

export const saveConfig = async (cfg: CliConfig): Promise<void> => {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n", {
    mode: 0o600,
  });
  // writeFile's mode is only applied when creating the file. Re-chmod so an
  // existing 0644 file (e.g. one created by an earlier buggy version) is
  // tightened on every save.
  await chmod(path, 0o600);
};

export const clearConfig = async (): Promise<void> => {
  const path = getConfigPath();
  await rm(path, { force: true });
};
