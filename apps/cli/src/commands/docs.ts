import { defineCommand } from "citty";

const DOCS_MD = `# bookmark CLI — manual

Bookmark + RSS reader (bookmark-rss) の CLI。Hono API (\`@acme/api\`) を Bearer
トークンで叩く。AI agent や人間が \`pnpm cli docs\` を実行して全容を確認できる。

## Quickstart

\`\`\`bash
# 1. .env に BOOKMARK_API_URL を設定 (例: http://localhost:3000)
# 2. web (dev) を起動 → ブラウザで Google サインインしておく
pnpm dev

# 3. login (device authorization flow)
pnpm cli login

# 4. 操作
pnpm cli bookmark add https://example.com/
pnpm cli bookmark list
pnpm cli bookmark list -q keyword
pnpm cli bookmark delete <full-uuid> -- --yes

# 5. 必要に応じて
pnpm cli logout
\`\`\`

## Configuration

| Source | What | Notes |
|---|---|---|
| \`.env\` の \`BOOKMARK_API_URL\` | API ベース URL | dev 実行時に dotenv 経由で読み込まれる |
| Build 時の \`BOOKMARK_API_URL\` | dist に焼き込まれる固定値 | \`pnpm build\` で tsdown が文字列リテラルに置換 |
| \`~/.config/bookmark-rss/config.json\` | Bearer token (0600) | login 成功時に保存。XDG_CONFIG_HOME 尊重 |

dist (ビルド後の \`dist/index.mjs\`) は **ビルド時の URL に固定**。実行時の
\`process.env.BOOKMARK_API_URL\` は無視される。

## Auth

Better Auth の Device Authorization Grant (RFC 8628) を使用。

1. CLI が \`POST /api/auth/device/code\` を叩いて user_code + verification_uri_complete を取得
2. CLI が verification_uri_complete を案内 + ブラウザ自動オープン
3. ユーザーが web の \`/device\` ページで承認 (事前に Google サインイン必須)
4. CLI が \`POST /api/auth/device/token\` を interval 秒ごとに polling
5. access_token を \`~/.config/bookmark-rss/config.json\` に 0600 で保存

\`logout\` は config.json を削除するのみ (サーバー側のセッション無効化はしない)。

## Commands

### \`bookmark login\`

Device flow で認証して token を保存する。

- 引数: なし
- baseUrl は \`BOOKMARK_API_URL\` から取得。未設定なら即エラー
- 失敗ケース:
  - \`API base URL is not set.\` — \`BOOKMARK_API_URL\` 未設定 (exit 1)
  - \`Failed to start device flow\` — API へ接続できない (exit 1)
  - \`Authorization failed: access_denied\` — ユーザーが web で「拒否」を押した
  - \`Authorization failed: expired_token\` — 期限切れ (デフォルト ~10分)
  - \`Device code expired before approval.\` — polling 期限切れ

### \`bookmark logout\`

保存トークンを削除する。

- 引数:
  - \`--yes\` (boolean): 確認プロンプトをスキップ
- config が無ければ \`Nothing to remove.\` で何もしない

### \`bookmark bookmark add <url>\`

新しいブックマークを追加する。

- 引数:
  - \`<url>\` (positional, optional): 追加する URL。省略すると prompt で入力
- 出力例:
  \`\`\`
  ┌  bookmark add
  ◇  Added
  └  + JavaScript With Syntax For Types.
    https://www.typescriptlang.org/
  \`\`\`
- 失敗ケース:
  - \`Invalid URL.\` — URL が http(s) でない
  - \`Already bookmarked.\` — 同じ URL が既に登録済み (HTTP 409)
  - \`Could not fetch the page.\` — OG fetch 失敗 (HTTP 422)
  - \`Unauthorized.\` — token 期限切れ (HTTP 401)

サーバー側は OG 取得後にバックグラウンドで readability 抽出 (worker-jobs)
を triggers し、contentMarkdown を埋める。CLI はその完了を待たない。

### \`bookmark bookmark list\`

ブックマーク一覧を表示する。

- 引数:
  - \`-q <query>\` (string, optional): 全文検索クエリ (FTS5 + Intl.Segmenter)
  - \`--limit <n>\` (string, default \`50\`): 表示件数の上限
- 出力例:
  \`\`\`
  1. JavaScript With Syntax For Types.
     https://www.typescriptlang.org/
     2026-05-20
     9c243802-4b8b-4b65-b06f-0a38ba8032ff
  \`\`\`
- ID は **フル UUID** で表示 (delete に直接渡せる)
- 0 件のとき: \`No bookmarks yet.\` / \`No matches for "<q>".\`
- limit 超過時: 末尾に \`+N more (use --limit)\`

検索: server 側で \`tokenize\` (Intl.Segmenter ja word segmentation +
NFKC normalize + lowercase + long-vowel unification) → FTS5 MATCH (\`unicode61\`
tokenizer) → bm25 でランキング。

### \`bookmark bookmark delete <id>\`

ブックマークを削除する。

- 引数:
  - \`<id>\` (positional, required): **フル UUID** (\`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\`)。
    短縮 ID や prefix は拒否される (誤削除防止)
  - \`--yes\` (boolean): 確認プロンプトをスキップ
- 出力例:
  \`\`\`
  ┌  bookmark delete
  ◇  Found: JavaScript With Syntax For Types.
  ◆  Delete JavaScript With Syntax For Types.?
  ◇  Deleted.
  └  Done.
  \`\`\`
- 失敗ケース:
  - \`"<id>" is not a full UUID.\` — UUID 形式違反 (削除前に弾く)
  - \`Not found.\` — UUID は valid だが該当 bookmark なし (HTTP 404)
  - \`Unauthorized.\` — token 期限切れ (HTTP 401)

\`--yes\` を pnpm 経由で渡すときは \`pnpm cli bookmark delete <id> -- --yes\`
のように \`--\` で pnpm の引数解釈を打ち切ること (\`--yes\` は pnpm 自身が吸収する)。

### \`bookmark docs\`

このマニュアル (Markdown) を stdout に出力する。

## Exit codes

| Code | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 何らかの失敗 (詳細は stderr/stdout のメッセージで判定) |

成功は \`process.exitCode\` を設定しないので 0、失敗ケースは明示的に
\`process.exitCode = 1\` を設定して return する。

## Build

\`\`\`bash
# .env の BOOKMARK_API_URL を bundle に焼き込む
pnpm -F cli build

# 別環境用にビルドするときは shell で上書き
BOOKMARK_API_URL=https://api.example.com pnpm -F cli build

# 成果物
./apps/cli/dist/index.mjs        # shebang + 実行権限付き
\`\`\`

dist は \`tsdown\` (Rolldown) で ESM 単一バンドル + dynamic-import チャンク 1 つ。
\`process.env.BOOKMARK_API_URL\` は \`define\` で文字列リテラルに置換され、実行時の
環境変数は反映されない。

## Files / Paths

| Path | Purpose |
|---|---|
| \`~/.config/bookmark-rss/config.json\` | token storage (mode 0600) |
| \`$XDG_CONFIG_HOME/bookmark-rss/config.json\` | 上記の XDG 版 |
| \`.env\` (repo root) | dev 用環境変数。\`pnpm cli\` 経由なら自動で読まれる |
| \`apps/cli/dist/index.mjs\` | ビルド後の単一バイナリ |
`;

export const docsCommand = defineCommand({
  meta: {
    name: "docs",
    description: "Print the full CLI manual (Markdown) to stdout",
  },
  run() {
    process.stdout.write(DOCS_MD);
  },
});
