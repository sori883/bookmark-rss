import { Link, useNavigate } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";
import { authClient } from "~/auth/client";

export default function Header() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="page-wrap flex items-center justify-between gap-4 py-3">
        <Link
          to="/"
          className="flex items-center gap-2 text-base font-semibold text-[var(--text)] no-underline hover:no-underline"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          Bookmark RSS
        </Link>
        <div className="flex items-center gap-2">
          {!isPending && session && (
            <>
              <span className="hidden text-sm text-[var(--text-muted)] sm:inline">
                {session.user.name}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                サインアウト
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
