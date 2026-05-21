import { describe, expect, it, vi } from "vitest";

import {
  VertexGeminiError,
  createVertexGeminiClient,
} from "../../src/recommend/vertex-gemini";

interface RawPicks {
  picks: { id: string; reason: string }[];
}

const stubGenerate = (picks: RawPicks["picks"]) =>
  vi.fn<(prompt: string) => Promise<RawPicks>>().mockResolvedValue({
    picks,
  });

describe("createVertexGeminiClient", () => {
  it("maps the model output into RecommendationPick[]", async () => {
    const client = createVertexGeminiClient({
      generate: stubGenerate([
        { id: "a", reason: "面白そう" },
        { id: "b", reason: "最近の興味と一致" },
      ]),
    });

    const picks = await client.generateRecommendations({
      bookmarks: [],
      candidates: [
        { id: "a", title: "A", description: null },
        { id: "b", title: "B", description: null },
      ],
      count: 5,
    });

    expect(picks).toEqual([
      { articleId: "a", reason: "面白そう" },
      { articleId: "b", reason: "最近の興味と一致" },
    ]);
  });

  it("passes a prompt containing the bookmarks and candidates to generate()", async () => {
    const generate = stubGenerate([{ id: "x", reason: "" }]);
    const client = createVertexGeminiClient({ generate });

    await client.generateRecommendations({
      bookmarks: [{ title: "TypeScript 5", description: "型の話" }],
      candidates: [
        { id: "x", title: "Rust GAT", description: "ジェネリクスの話" },
      ],
      count: 5,
    });

    const prompt = generate.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("TypeScript 5");
    expect(prompt).toContain("型の話");
    expect(prompt).toContain("Rust GAT");
    expect(prompt).toContain("ジェネリクスの話");
    expect(prompt).toContain("id=x");
  });

  it("filters out picks whose ID is not in the candidate set", async () => {
    const client = createVertexGeminiClient({
      generate: stubGenerate([
        { id: "a", reason: "ok" },
        { id: "ghost", reason: "removed" },
        { id: "b", reason: "ok" },
      ]),
    });
    const picks = await client.generateRecommendations({
      bookmarks: [],
      candidates: [
        { id: "a", title: "A", description: null },
        { id: "b", title: "B", description: null },
      ],
      count: 5,
    });
    expect(picks.map((p) => p.articleId)).toEqual(["a", "b"]);
  });

  it("trims to the requested count", async () => {
    const client = createVertexGeminiClient({
      generate: stubGenerate([
        { id: "a", reason: "" },
        { id: "b", reason: "" },
        { id: "c", reason: "" },
      ]),
    });
    const picks = await client.generateRecommendations({
      bookmarks: [],
      candidates: [
        { id: "a", title: "A", description: null },
        { id: "b", title: "B", description: null },
        { id: "c", title: "C", description: null },
      ],
      count: 2,
    });
    expect(picks).toHaveLength(2);
  });

  it("wraps generate() failures in VertexGeminiError", async () => {
    const client = createVertexGeminiClient({
      generate: vi
        .fn<(prompt: string) => Promise<RawPicks>>()
        .mockRejectedValue(new Error("API down")),
    });
    await expect(
      client.generateRecommendations({
        bookmarks: [],
        candidates: [{ id: "a", title: "A", description: null }],
        count: 1,
      }),
    ).rejects.toThrow(VertexGeminiError);
  });
});
