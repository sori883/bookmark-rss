import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { bookmark } from "@acme/db/schema";

import {
  removeBookmarkFts,
  removeBookmarkFtsMany,
  syncBookmarkFts,
} from "../src/bookmark-fts";
import { createTestDb } from "./helpers/db";
import type { TestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";
import type { TestUser } from "./helpers/seed";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

const searchFts = async (
  db: TestDb,
  query: string,
): Promise<string[]> => {
  const rows = await db.all(
    sql.raw(
      `SELECT bookmark_id AS id FROM bookmark_fts WHERE bookmark_fts MATCH '${query}'`,
    ),
  );
  return (rows as { id: string }[]).map((r) => r.id);
};

describe("syncBookmarkFts", () => {
  it("inserts a row that is searchable by tokenized terms", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "東京の天気",
      description: "今日は晴れ",
      contentMarkdown: "東京タワーから見る景色",
    });

    await syncBookmarkFts(db, {
      id: "b1",
      title: "東京の天気",
      description: "今日は晴れ",
      contentMarkdown: "東京タワーから見る景色",
    });

    expect(await searchFts(db, "東京")).toEqual(["b1"]);
    expect(await searchFts(db, "晴れ")).toEqual(["b1"]);
    // Intl.Segmenter often treats compound nouns as a single token
    // ("東京タワー"), so we search by the segmenter-aligned form.
    expect(await searchFts(db, "景色")).toEqual(["b1"]);
  });

  it("replaces the existing row when called twice", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "古いタイトル",
    });
    await syncBookmarkFts(db, {
      id: "b1",
      title: "古いタイトル",
      description: null,
      contentMarkdown: null,
    });
    await syncBookmarkFts(db, {
      id: "b1",
      title: "新しいタイトル",
      description: null,
      contentMarkdown: null,
    });

    expect(await searchFts(db, "古い")).toEqual([]);
    expect(await searchFts(db, "新しい")).toEqual(["b1"]);
  });

  it("handles null description and content gracefully", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "Only Title",
    });
    await syncBookmarkFts(db, {
      id: "b1",
      title: "Only Title",
      description: null,
      contentMarkdown: null,
    });
    expect(await searchFts(db, "only")).toEqual(["b1"]);
  });

  it("supports ASCII case-insensitive search via tokenizer normalization", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "React TypeScript",
    });
    await syncBookmarkFts(db, {
      id: "b1",
      title: "React TypeScript",
      description: null,
      contentMarkdown: null,
    });
    expect(await searchFts(db, "react")).toEqual(["b1"]);
    expect(await searchFts(db, "typescript")).toEqual(["b1"]);
  });
});

describe("removeBookmarkFts", () => {
  it("removes the row so it stops matching", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/1",
      title: "東京",
    });
    await syncBookmarkFts(db, {
      id: "b1",
      title: "東京",
      description: null,
      contentMarkdown: null,
    });
    expect(await searchFts(db, "東京")).toEqual(["b1"]);

    await removeBookmarkFts(db, "b1");
    expect(await searchFts(db, "東京")).toEqual([]);
  });
});

describe("removeBookmarkFtsMany", () => {
  it("removes multiple rows in a single query", async () => {
    for (const id of ["b1", "b2", "b3"]) {
      await db.insert(bookmark).values({
        id,
        userId: user.id,
        url: `https://example.com/${id}`,
        title: `タイトル${id}`,
      });
      await syncBookmarkFts(db, {
        id,
        title: `タイトル${id}`,
        description: null,
        contentMarkdown: null,
      });
    }
    await removeBookmarkFtsMany(db, ["b1", "b3"]);
    expect((await searchFts(db, "タイトル")).sort()).toEqual(["b2"]);
  });

  it("does nothing when given an empty list", async () => {
    await expect(removeBookmarkFtsMany(db, [])).resolves.toBeUndefined();
  });
});
