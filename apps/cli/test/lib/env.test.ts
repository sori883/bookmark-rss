import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MissingBaseUrlError, getBaseUrl } from "../../src/lib/env.ts";

let original: string | undefined;

beforeEach(() => {
  original = process.env.BOOKMARK_API_URL;
  delete process.env.BOOKMARK_API_URL;
});

afterEach(() => {
  if (original === undefined) {
    delete process.env.BOOKMARK_API_URL;
  } else {
    process.env.BOOKMARK_API_URL = original;
  }
});

describe("getBaseUrl", () => {
  it("throws when BOOKMARK_API_URL is unset", () => {
    expect(() => getBaseUrl()).toThrow(MissingBaseUrlError);
  });

  it("throws for an empty string", () => {
    process.env.BOOKMARK_API_URL = "";
    expect(() => getBaseUrl()).toThrow(MissingBaseUrlError);
  });

  it("throws for whitespace only", () => {
    process.env.BOOKMARK_API_URL = "   ";
    expect(() => getBaseUrl()).toThrow(MissingBaseUrlError);
  });

  it("returns the value when set", () => {
    process.env.BOOKMARK_API_URL = "https://api.example.com";
    expect(getBaseUrl()).toBe("https://api.example.com");
  });

  it("strips trailing slashes", () => {
    process.env.BOOKMARK_API_URL = "https://api.example.com/";
    expect(getBaseUrl()).toBe("https://api.example.com");
  });

  it("trims surrounding whitespace", () => {
    process.env.BOOKMARK_API_URL = "  https://api.example.com  ";
    expect(getBaseUrl()).toBe("https://api.example.com");
  });
});
