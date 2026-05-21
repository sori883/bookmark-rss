import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../entrypoints/popup/App";
import { saveToken } from "../../src/lib/token-storage";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sign-in prompt when no token and session auth fails", async () => {
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /ログイン/ }),
    ).toBeInTheDocument();
  });

  it("clears a stale token and shows the sign-in prompt when session auth fails", async () => {
    await saveToken("stale-token", 3600);
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /ログイン/ }),
    ).toBeInTheDocument();
  });

  it("renders the bookmark view when session auth succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ session: { id: "s1" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-auth-jwt": "jwt-from-session",
          },
        }),
      ),
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: /ブックマークに追加/ }),
    ).toBeInTheDocument();
  });
});
