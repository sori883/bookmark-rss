import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AddBookmarkResult } from "../../src/lib/bookmark-client";
import { BookmarkView } from "../../entrypoints/popup/bookmark-view";

const onAddOk = (): Promise<AddBookmarkResult> =>
  Promise.resolve({
    ok: true,
    bookmark: { id: "b1", url: "https://example.com" },
  });

describe("BookmarkView", () => {
  it("shows a placeholder when there is no active tab", () => {
    render(
      <BookmarkView
        currentTab={null}
        onAdd={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/アクティブなタブが見つかりません/),
    ).toBeInTheDocument();
  });

  it("displays the current tab title and URL", () => {
    render(
      <BookmarkView
        currentTab={{ url: "https://example.com", title: "Example" }}
        onAdd={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );

    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
  });

  it("calls onAdd with the current tab URL when the add button is clicked", async () => {
    const onAdd = vi.fn<(url: string) => Promise<AddBookmarkResult>>(onAddOk);

    render(
      <BookmarkView
        currentTab={{ url: "https://example.com", title: "Example" }}
        onAdd={onAdd}
        onUnauthorized={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /ブックマークに追加/ }),
    );

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("https://example.com");
  });

  it("shows a success message after a successful add", async () => {
    render(
      <BookmarkView
        currentTab={{ url: "https://example.com" }}
        onAdd={onAddOk}
        onUnauthorized={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /ブックマークに追加/ }),
    );

    expect(await screen.findByText(/added!/i)).toBeInTheDocument();
  });

  it("shows a duplicate message when the bookmark already exists", async () => {
    const onAdd = vi
      .fn<(url: string) => Promise<AddBookmarkResult>>()
      .mockResolvedValue({ ok: false, reason: "already-exists" });

    render(
      <BookmarkView
        currentTab={{ url: "https://example.com" }}
        onAdd={onAdd}
        onUnauthorized={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /ブックマークに追加/ }),
    );

    expect(await screen.findByText(/already/i)).toBeInTheDocument();
  });

  it("invokes onUnauthorized when the API returns 401", async () => {
    const onUnauthorized = vi.fn();
    const onAdd = vi
      .fn<(url: string) => Promise<AddBookmarkResult>>()
      .mockResolvedValue({ ok: false, reason: "unauthorized" });

    render(
      <BookmarkView
        currentTab={{ url: "https://example.com" }}
        onAdd={onAdd}
        onUnauthorized={onUnauthorized}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /ブックマークに追加/ }),
    );

    await waitFor(() => {
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error message when the page cannot be fetched", async () => {
    const onAdd = vi
      .fn<(url: string) => Promise<AddBookmarkResult>>()
      .mockResolvedValue({ ok: false, reason: "fetch-failed" });

    render(
      <BookmarkView
        currentTab={{ url: "https://example.com" }}
        onAdd={onAdd}
        onUnauthorized={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /ブックマークに追加/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/取得/);
  });
});
