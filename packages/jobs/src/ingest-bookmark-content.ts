import { eq } from "drizzle-orm";

import type { DbType } from "@acme/db/client";
import { bookmark } from "@acme/db/schema";

import type { BookmarkContentFetcher } from "./bookmark-content-fetcher";
import { syncBookmarkFts } from "./bookmark-fts";

export interface IngestBookmarkContentOptions {
  db: DbType;
  contentFetcher: BookmarkContentFetcher;
  bookmark: { id: string; url: string };
}

export interface IngestBookmarkContentResult {
  contentLength: number;
}

export const ingestBookmarkContent = async (
  options: IngestBookmarkContentOptions,
): Promise<IngestBookmarkContentResult> => {
  const { db, contentFetcher, bookmark: bm } = options;
  const fetched = await contentFetcher.fetch(bm.url);
  await db
    .update(bookmark)
    .set({ contentMarkdown: fetched.markdown })
    .where(eq(bookmark.id, bm.id));

  // Re-sync FTS with the new content so search picks up the body.
  const row = await db
    .select({
      id: bookmark.id,
      title: bookmark.title,
      description: bookmark.description,
      contentMarkdown: bookmark.contentMarkdown,
    })
    .from(bookmark)
    .where(eq(bookmark.id, bm.id))
    .get();
  if (row) {
    await syncBookmarkFts(db, row);
  }

  return { contentLength: fetched.markdown.length };
};
