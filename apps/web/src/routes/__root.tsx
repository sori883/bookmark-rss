import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { ConfirmProvider } from "../components/Confirm";
import { ToastProvider } from "../components/Toast";
import appCss from "../styles.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark')?stored:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(mode);root.setAttribute('data-theme',mode);root.style.colorScheme=mode;}catch(e){}})();`;

const SCROLL_REVEAL_SCRIPT = `(function(){var t;var root=document.documentElement;function on(){root.classList.add('is-scrolling');clearTimeout(t);t=setTimeout(function(){root.classList.remove('is-scrolling');},800);}window.addEventListener('scroll',on,{capture:true,passive:true});window.addEventListener('wheel',on,{capture:true,passive:true});window.addEventListener('touchmove',on,{capture:true,passive:true});})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bookmark RSS" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="page-wrap flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12 text-center">
      <p className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
        404
      </p>
      <h1 className="text-xl font-semibold text-[var(--text)]">
        ページが見つかりませんでした
      </h1>
      <Link
        to="/app/articles"
        className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] no-underline hover:bg-[var(--accent-strong)]"
      >
        トップへ戻る
      </Link>
    </main>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SCROLL_REVEAL_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
