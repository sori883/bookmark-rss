-- Full-text search over bookmarks. We tokenize on the application side using
-- Intl.Segmenter (Japanese-aware word segmentation) and write the resulting
-- whitespace-separated tokens into this virtual table, so the default
-- `unicode61` FTS5 tokenizer just splits on whitespace.
--
-- `bookmark_id` is stored UNINDEXED: present for joining back to the bookmark
-- row but excluded from the inverted index to avoid false matches against
-- UUID fragments.
CREATE VIRTUAL TABLE bookmark_fts USING fts5(
  bookmark_id UNINDEXED,
  title,
  description,
  content_markdown
);
