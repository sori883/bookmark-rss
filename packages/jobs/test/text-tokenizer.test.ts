import { describe, expect, it } from "vitest";

import { buildAndQuery, tokenize } from "../src/text-tokenizer";

describe("tokenize", () => {
  it("returns empty string for empty input", () => {
    expect(tokenize("")).toBe("");
    expect(tokenize(null)).toBe("");
    expect(tokenize(undefined)).toBe("");
  });

  it("splits Japanese text into whitespace-separated tokens", () => {
    const result = tokenize("東京の天気はとても良い");
    const tokens = result.split(" ");
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens).toContain("東京");
  });

  it("preserves latin/digit tokens", () => {
    const result = tokenize("React 19 and Drizzle ORM");
    const tokens = result.split(" ");
    expect(tokens).toContain("react");
    expect(tokens).toContain("19");
    expect(tokens).toContain("drizzle");
    expect(tokens).toContain("orm");
  });

  it("lowercases ASCII letters", () => {
    expect(tokenize("HELLO World")).toContain("hello");
    expect(tokenize("HELLO World")).toContain("world");
  });

  it("applies NFKC normalization (full-width to half-width)", () => {
    const result = tokenize("React");
    expect(result).toContain("react");
  });

  it("normalizes long-vowel variants to U+30FC", () => {
    const a = tokenize("コーヒー");
    const b = tokenize("コーヒー");
    const c = tokenize("コｰヒｰ");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("drops punctuation and whitespace", () => {
    const result = tokenize("こんにちは、世界!");
    const tokens = result.split(" ");
    expect(tokens.every((t) => /\S/.test(t))).toBe(true);
    expect(result).not.toContain(",");
    expect(result).not.toContain("!");
  });
});

describe("buildAndQuery", () => {
  it("returns null for empty input", () => {
    expect(buildAndQuery("")).toBeNull();
    expect(buildAndQuery("、。 ")).toBeNull();
  });

  it("joins quoted tokens with spaces (FTS5 implicit AND)", () => {
    const q = buildAndQuery("東京 タワー");
    expect(q).toBe('"東京" "タワー"');
  });

  it("quotes single tokens", () => {
    const q = buildAndQuery("React");
    expect(q).toBe('"react"');
  });

  it("drops non-word characters (quotes, punctuation) from the query", () => {
    // Intl.Segmenter filters non-word segments, so quotes/punct never reach
    // the FTS5 expression. The defensive `"` → `""` escape inside buildAndQuery
    // therefore never triggers for normal user input.
    const q = buildAndQuery('she said "hi"');
    expect(q).toBe('"she" "said" "hi"');
  });
});
