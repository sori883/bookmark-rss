import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { bookmark } from "@acme/db/schema";

import type { BookmarkContentFetcher } from "../src/bookmark-content-fetcher";
import type { TestDb } from "./helpers/db";
import type { TestUser } from "./helpers/seed";
import { ingestBookmarkContent } from "../src/ingest-bookmark-content";
import { createTestDb } from "./helpers/db";
import { createTestUser } from "./helpers/seed";

let db: TestDb;
let user: TestUser;

beforeEach(async () => {
  db = await createTestDb();
  user = await createTestUser(db);
});

const mkFetcher = (markdown: string): BookmarkContentFetcher => ({
  fetch: () => Promise.resolve({ title: "Stub", markdown }),
});

describe("ingestBookmarkContent", () => {
  it("stores the fetched markdown into bookmark.contentMarkdown", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/post",
      title: "P",
    });
    const fetcher = mkFetcher("# Hello\n\nWorld");

    const result = await ingestBookmarkContent({
      db,
      contentFetcher: fetcher,
      bookmark: { id: "b1", url: "https://example.com/post" },
    });

    expect(result.contentLength).toBeGreaterThan(0);
    const row = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.id, "b1"))
      .get();
    expect(row?.contentMarkdown).toBe("# Hello\n\nWorld");
  });

  it("overwrites existing contentMarkdown", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/post",
      title: "P",
      contentMarkdown: "old",
    });

    await ingestBookmarkContent({
      db,
      contentFetcher: mkFetcher("new"),
      bookmark: { id: "b1", url: "https://example.com/post" },
    });

    const row = await db
      .select()
      .from(bookmark)
      .where(eq(bookmark.id, "b1"))
      .get();
    expect(row?.contentMarkdown).toBe("new");
  });

  it("propagates the fetcher's error", async () => {
    await db.insert(bookmark).values({
      id: "b1",
      userId: user.id,
      url: "https://example.com/post",
      title: "P",
    });
    const fetcher: BookmarkContentFetcher = {
      fetch: () => Promise.reject(new Error("fetch failed")),
    };
    await expect(
      ingestBookmarkContent({
        db,
        contentFetcher: fetcher,
        bookmark: { id: "b1", url: "https://example.com/post" },
      }),
    ).rejects.toThrow("fetch failed");
  });
});
