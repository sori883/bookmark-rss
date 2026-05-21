/**
 * Japanese-aware text tokenization for FTS5.
 *
 * The strategy mirrors the well-known D1/SQLite pattern: rather than relying
 * on FTS5's built-in tokenizers (which split poorly for CJK), we segment text
 * in the application using ICU's word segmenter exposed via Intl.Segmenter,
 * normalize widths/case, and emit a whitespace-joined string. FTS5's default
 * unicode61 tokenizer then trivially splits on whitespace.
 *
 * The same function MUST be used for both index writes and query parsing so
 * that token boundaries line up.
 */

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

/**
 * Normalize text for tokenization:
 * - NFKC: 全角→半角、互換文字統一
 * - lowercase: case-insensitive search
 * - 長音記号統一 (U+30FC vs U+FF70 vs hyphen variants)
 */
const normalize = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ー－—–]/g, "ー");

/**
 * Tokenize text into a single whitespace-separated string of word-like tokens.
 *
 * Returns "" for empty input. Word-like segments are kept (kanji, kana, latin,
 * digits); punctuation and whitespace are dropped.
 */
export const tokenize = (text: string | null | undefined): string => {
  if (!text) return "";
  const tokens: string[] = [];
  for (const seg of segmenter.segment(normalize(text))) {
    if (seg.isWordLike) tokens.push(seg.segment);
  }
  return tokens.join(" ");
};

/**
 * Build an FTS5 MATCH expression that requires all input tokens to be present
 * (AND combination). Each token is wrapped in double quotes so that FTS5
 * treats it as a literal phrase, preventing accidental operator parsing.
 *
 * Returns null when the query has no usable tokens (e.g. only punctuation).
 */
export const buildAndQuery = (text: string): string | null => {
  const tokens = tokenize(text).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
};
