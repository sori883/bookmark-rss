import { sql } from "drizzle-orm";

import type { DbType } from "@acme/db/client";

import { tokenize } from "./text-tokenizer";

export interface BookmarkFtsRow {
  id: string;
  title: string;
  description: string | null;
  contentMarkdown: string | null;
}

/**
 * Insert or replace the FTS5 row for a bookmark.
 *
 * Strategy: delete then insert, because FTS5 contentless tables don't have
 * a primary key we can target with INSERT OR REPLACE — bookmark_id is
 * UNINDEXED so it lives outside the row identity machinery.
 */
export const syncBookmarkFts = async (
  db: DbType,
  bookmark: BookmarkFtsRow,
): Promise<void> => {
  await removeBookmarkFts(db, bookmark.id);
  await db.run(sql`
    INSERT INTO bookmark_fts (bookmark_id, title, description, content_markdown)
    VALUES (
      ${bookmark.id},
      ${tokenize(bookmark.title)},
      ${tokenize(bookmark.description)},
      ${tokenize(bookmark.contentMarkdown)}
    )
  `);
};

export const removeBookmarkFts = async (
  db: DbType,
  bookmarkId: string,
): Promise<void> => {
  await db.run(
    sql`DELETE FROM bookmark_fts WHERE bookmark_id = ${bookmarkId}`,
  );
};

export const removeBookmarkFtsMany = async (
  db: DbType,
  bookmarkIds: string[],
): Promise<void> => {
  if (bookmarkIds.length === 0) return;
  // Drizzle's `sql` template doesn't expand arrays into placeholders
  // automatically, so build the IN clause by composing literal-safe ids.
  // We control ids (UUIDs) so this is safe.
  await db.run(
    sql.raw(
      `DELETE FROM bookmark_fts WHERE bookmark_id IN (${bookmarkIds
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(",")})`,
    ),
  );
};
