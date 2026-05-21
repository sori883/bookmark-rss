/* eslint-disable @typescript-eslint/no-base-to-string */
import { describe, expect, it, vi } from "vitest";

import {
  VertexGeminiError,
  createVertexGeminiClient,
} from "../../src/recommend/vertex-gemini";

// A real-looking but disposable RSA private key generated solely for tests.
// Generated with: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048
// then openssl pkcs8 -topk8 -nocrypt -in key.pem
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDX5RNgsKvB2/Q9
yYDhU+gWdvIw5JVbF8Y29CpsP6L8t8ZxlmJDxr3GHpDuvfTzCNDg7+vF7lG3z3uV
RtSscC+CK6L8RmwLZ/cAhpvE2MM9MlMM37jrM02hLpkmaB1MTwjKvFn+jKbAyzZE
Cwx3wb+vRgYIJ6xphxYWFcGvbk1HfBmIDIfPVjVgs6ozt1Ndlt7kFvW9R83cyTbB
LfeqDjLh2J3sZ7vNCRcaqcvANgFszCkCQX8DBJI+H30Yqjt2dFvIYpEM2dRcU0NK
zrt/B7wDsZ/+S0Z3Itxa1Kz4xY0R7Q8YogkkU1lvtNuYpFXuW02pjOI2adFEKDQU
GUWfwLT5AgMBAAECggEAEPB2mC/+e+TT24Ji9k3eyZcRWeftvfWUw0vAd2c81r2L
b2lAtAB3pTKsKf9z6lAfwiCWE1f6/8VgKw0aPwd1A8d6F8gG7hAfDsT3iyOJgGSn
PRDZbZ2qPgzgF7+SLkz6XdfYUMcsK0ARgIaJlW7sJ4uTOIPRBcM4VeApFs1cuEKK
GMSHM1aHFnwgFFVHybvY7g7BWZP7K6kBJVGHIVlqgGfgRl0YDi5sw8FahbASTnNX
nzowtKjJP9YyTJDOAXTTuAW1Ts0OEvxRb0AWQDeAVk2bMyTL/V7AZZRT89GIxPzD
WL44YHN1m5+jOZdvfvyldKpfYTLp1B3+SOJYIA+Y/QKBgQDvDD6P+7lyJ5LkO4nN
qFGyAOPMNW3T4eLp7sUlbcOPvHbCnGgYhCSyFsf8M2krCjbHGZQjUjUyZZv8Du9Y
+TgXcCw7vUcgCq3vbI+/wp+vK16AmCMNGjqx4xnQNH7Jw82eL21BIPLwSnZjy+E1
fr3qsiwYrvNZBR9JN+/oBOMnVQKBgQDmcgDsxL8KWlfDGwAyMxAOVjUmkICj3KZF
JtSjvCAk8j5N1eyBfaWHV1RNuwWp+rqOAdEjlw3T2dsCYUWj/ssLDpyXIVMSL/qN
0Rq7xGwLkXxh2DEy3pGCgvHTmZyV5RtIDghyKEjjLNxc4Lp29HuktwsPGFFCYM+f
PfYWPLgGFQKBgQCwHrV3Z+QlDhrXf6T2gFmWvESSeNoVcEC/dvFAHHfpQ4/r1XYf
P/UJqGRyEcAJ97l3sw6PrUUDgZbjLLNFn5sIuvAcOQwIqZ02uIThlR6vDpNMfaB3
+vmcDdF/EBatPL+9wPCqUkapM4lEC36cAWQUWPmzPMcbR4Y9NvRD1kZxxQKBgEnY
0OBJDXFLPCKLi0Sup12iD4/SmF6m9aOcrUSPCRSL3VxKtj37Pp2yL/B0xLpaiyXp
yEfDtBLLkkbBjVZqU2ddPb6PVlMfLD3ZG2YT7+yCsdT/JcdRy+wfA0xUI9KZWqOM
gYsa+ScDPF85g6Ev/zlxIO40SmpJTBoltyiF0NABAoGABDt/sUw4uMOSc8Tx8L25
EZmO5MR8eW6yyymVMtxv8jbk9Wq67G2qK9ngz5G8Lc1AQEHbWvBC2yNvm/q1Otkj
QkubXxqJWX+5e1cWXTSGADWnYvOWjzMpZjT34M9nKaNzcK6CnZmwL8Qd7P/Et9rL
6cTxLb4dHvyZBQBNZqDpkX0=
-----END PRIVATE KEY-----`;

interface TokenRequest {
  url: string;
  body: URLSearchParams;
}

interface GenerateRequest {
  url: string;
  authorization: string;
  body: unknown;
}

const buildFetchMock = (options: {
  accessToken?: string;
  geminiPicks?: { id: string; reason: string }[];
  geminiOverrideText?: string;
  geminiStatus?: number;
}) => {
  const tokenRequests: TokenRequest[] = [];
  const generateRequests: GenerateRequest[] = [];
  const fetchImpl = vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === "string" ? input : String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      tokenRequests.push({ url, body });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: options.accessToken ?? "fake-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    if (url.includes("aiplatform.googleapis.com")) {
      generateRequests.push({
        url,
        authorization:
          (init?.headers as Record<string, string> | undefined)
            ?.Authorization ?? "",
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      });
      if (options.geminiStatus && options.geminiStatus >= 400) {
        return Promise.resolve(
          new Response("Internal error", { status: options.geminiStatus }),
        );
      }
      const text =
        options.geminiOverrideText ?? JSON.stringify(options.geminiPicks ?? []);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  return { fetchImpl, tokenRequests, generateRequests };
};

const config = (
  overrides?: Partial<Parameters<typeof createVertexGeminiClient>[0]>,
) => ({
  projectId: "my-project",
  location: "us-central1",
  model: "gemini-2.5-flash-lite",
  serviceAccountEmail: "svc@my-project.iam.gserviceaccount.com",
  serviceAccountPrivateKey: TEST_PRIVATE_KEY,
  ...overrides,
});

describe("createVertexGeminiClient", () => {
  it("returns the picks parsed from the Gemini response", async () => {
    const { fetchImpl } = buildFetchMock({
      geminiPicks: [
        { id: "a", reason: "面白そう" },
        { id: "b", reason: "最近の興味と一致" },
      ],
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
    });

    const picks = await client.generateRecommendations({
      bookmarks: [{ title: "ブックマーク1", description: null }],
      candidates: [
        { id: "a", title: "A", description: null },
        { id: "b", title: "B", description: null },
        { id: "c", title: "C", description: null },
      ],
      count: 5,
    });

    expect(picks).toEqual([
      { articleId: "a", reason: "面白そう" },
      { articleId: "b", reason: "最近の興味と一致" },
    ]);
  });

  it("calls the right Vertex AI endpoint with the configured model and bearer token", async () => {
    const { fetchImpl, generateRequests } = buildFetchMock({
      accessToken: "tok-xyz",
      geminiPicks: [{ id: "a", reason: "" }],
    });
    const client = createVertexGeminiClient({
      ...config({
        location: "asia-northeast1",
        model: "gemini-3.5-flash-lite",
      }),
      fetchImpl,
    });
    await client.generateRecommendations({
      bookmarks: [],
      candidates: [{ id: "a", title: "A", description: null }],
      count: 1,
    });

    expect(generateRequests).toHaveLength(1);
    expect(generateRequests[0]?.url).toBe(
      "https://asia-northeast1-aiplatform.googleapis.com/v1/projects/my-project/locations/asia-northeast1/publishers/google/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(generateRequests[0]?.authorization).toBe("Bearer tok-xyz");
  });

  it("includes bookmarks and candidates in the prompt", async () => {
    const { fetchImpl, generateRequests } = buildFetchMock({
      geminiPicks: [{ id: "x", reason: "" }],
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
    });
    await client.generateRecommendations({
      bookmarks: [{ title: "TypeScript 5", description: "型の話" }],
      candidates: [
        { id: "x", title: "Rust GAT", description: "ジェネリクスの話" },
      ],
      count: 5,
    });

    const body = generateRequests[0]?.body as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = body.contents[0]?.parts[0]?.text ?? "";
    expect(prompt).toContain("TypeScript 5");
    expect(prompt).toContain("型の話");
    expect(prompt).toContain("Rust GAT");
    expect(prompt).toContain("ジェネリクスの話");
    expect(prompt).toContain("x");
  });

  it("filters out picks whose ID is not in the candidate set", async () => {
    const { fetchImpl } = buildFetchMock({
      geminiPicks: [
        { id: "a", reason: "ok" },
        { id: "ghost", reason: "should be removed" },
        { id: "b", reason: "ok" },
      ],
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
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
    const { fetchImpl } = buildFetchMock({
      geminiPicks: [
        { id: "a", reason: "" },
        { id: "b", reason: "" },
        { id: "c", reason: "" },
      ],
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
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

  it("strips ```json fences from the model output", async () => {
    const { fetchImpl } = buildFetchMock({
      geminiOverrideText: '```json\n[{"id":"a","reason":""}]\n```',
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
    });
    const picks = await client.generateRecommendations({
      bookmarks: [],
      candidates: [{ id: "a", title: "A", description: null }],
      count: 1,
    });
    expect(picks).toEqual([{ articleId: "a", reason: "" }]);
  });

  it("throws VertexGeminiError when the model returns non-JSON text", async () => {
    const { fetchImpl } = buildFetchMock({
      geminiOverrideText: "I cannot help with that.",
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
    });
    await expect(
      client.generateRecommendations({
        bookmarks: [],
        candidates: [{ id: "a", title: "A", description: null }],
        count: 1,
      }),
    ).rejects.toThrow(VertexGeminiError);
  });

  it("throws VertexGeminiError when Vertex AI returns 5xx", async () => {
    const { fetchImpl } = buildFetchMock({
      geminiStatus: 500,
    });
    const client = createVertexGeminiClient({
      ...config(),
      fetchImpl,
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
