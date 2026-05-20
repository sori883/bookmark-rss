// At runtime this reads process.env directly. For the built bundle, tsdown
// replaces `process.env.BOOKMARK_API_URL` with a string literal at build
// time, so the published binary is locked to a single endpoint.
export class MissingBaseUrlError extends Error {
  constructor() {
    super(
      "BOOKMARK_API_URL is not set. Define it in .env (dev) or at build time.",
    );
    this.name = "MissingBaseUrlError";
  }
}

const normalize = (v: string): string => v.trim().replace(/\/+$/, "");

export const getBaseUrl = (): string => {
  const raw = process.env.BOOKMARK_API_URL;
  if (typeof raw !== "string") {
    throw new MissingBaseUrlError();
  }
  const v = normalize(raw);
  if (v.length === 0) {
    throw new MissingBaseUrlError();
  }
  return v;
};
