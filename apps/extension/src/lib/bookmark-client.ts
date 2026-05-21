export interface BookmarkResource {
  id: string;
  url: string;
  title?: string;
}

export interface AddBookmarkParams {
  baseUrl: string;
  token: string;
  url: string;
}

export type AddBookmarkResult =
  | { ok: true; bookmark: BookmarkResource }
  | {
      ok: false;
      reason: "unauthorized" | "already-exists" | "fetch-failed";
    }
  | { ok: false; reason: "unknown"; status: number };

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export const addBookmark = async (
  { baseUrl, token, url }: AddBookmarkParams,
  fetchImpl: typeof fetch = fetch,
): Promise<AddBookmarkResult> => {
  const res = await fetchImpl(
    `${stripTrailingSlash(baseUrl)}/api/main/bookmarks`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    },
  );
  if (res.status === 201) {
    const bookmark = (await res.json()) as BookmarkResource;
    return { ok: true, bookmark };
  }
  if (res.status === 401) {
    return { ok: false, reason: "unauthorized" };
  }
  if (res.status === 409) {
    return { ok: false, reason: "already-exists" };
  }
  if (res.status === 422) {
    return { ok: false, reason: "fetch-failed" };
  }
  return { ok: false, reason: "unknown", status: res.status };
};
