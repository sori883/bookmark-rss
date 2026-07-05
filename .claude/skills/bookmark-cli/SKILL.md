---
name: bookmark-cli
description: Use when the user wants to add, list, search, or delete bookmarks in bookmark-rss, or sign in/out of it, from the command line. TRIGGER when the user mentions bookmarks, "ブックマーク", RSS reader entries, or the `br` CLI. Runs the pre-built `br` CLI (alias for the bookmark-rss command) against the Hono API.
allowed-tools: Bash(br:*)
---

# bookmark-rss CLI (`br`)

`br` は bookmark-rss (ブックマーク + RSS リーダー) の CLI。ビルド済み単一バンドルへのエイリアスで、Hono API を Bearer トークンで叩く。API のベース URL は**ビルド時に焼き込み済み**なので、実行時に `BOOKMARK_API_URL` を設定する必要はない。

トークンは login 成功時に `~/.config/bookmark-rss/config.json` (mode 0600) に保存される。`br docs` を実行すると常に最新の完全マニュアルが stdout に出る — 挙動に迷ったらまず `br docs` を見る。

## Commands

```bash
br login                          # device flow でサインイン（ブラウザ承認が必要）
br logout --yes                   # 保存トークンを削除
br bookmark add <url>             # ブックマーク追加
br bookmark list                  # 一覧表示
br bookmark list -q <query>       # 全文検索（日本語対応 FTS5）
br bookmark list --limit <n>      # 表示件数上限（default 50）
br bookmark delete <uuid> --yes   # 削除（フル UUID 指定）
br docs                           # 完全マニュアルを stdout に出力
```

## エージェントが非対話で使うときの注意

`br` は clack の対話プロンプトを持つコマンドがある。AI が実行する場合は**プロンプトに落ちない形**で呼ぶこと:

- **`br bookmark add`**: URL を省略すると対話入力を求められる。必ず `br bookmark add <url>` と引数で渡す。URL は `http(s)://` のみ受け付ける。
- **`br bookmark delete`**: 確認プロンプトが出る。必ず `--yes` を付けて `br bookmark delete <uuid> --yes` とする。`<uuid>` は**フル UUID** のみ（prefix・短縮 ID は誤削除防止のため拒否される）。UUID は `br bookmark list` の各エントリ末尾に表示される。
- **`br login`**: ブラウザでの人手承認が必須なので、AI が単独で完了させることはできない。未ログイン時は**ユーザーに `br login` の実行を依頼**する。

## 出力の読み方

- `br bookmark list` は各件を「番号 / タイトル / URL / 日付・タグ / **フル UUID**」の順で表示する。delete にはこの UUID をそのまま渡せる。
- 0 件: `No bookmarks yet.` または `No matches for "<q>".`
- limit 超過: 末尾に `+N more (use --limit)`

## よくあるエラー

| メッセージ | 意味 | 対処 |
|---|---|---|
| `Unauthorized. Run 'bookmark login' again.` (HTTP 401) | トークン期限切れ／未ログイン | ユーザーに `br login` を依頼 |
| `Already bookmarked.` (HTTP 409) | 同一 URL が登録済み | 追加不要 |
| `Could not fetch the page.` (HTTP 422) | ページ取得（OG）失敗 | URL を確認 |
| `Invalid URL.` | http(s) でない | URL を修正 |
| `"<id>" is not a full UUID.` | UUID 形式違反 | `br bookmark list` で正しい UUID を取得 |
| `Not found.` (HTTP 404) | 該当ブックマークなし | ID を再確認 |

exit code は成功で 0、失敗で 1。詳細は stdout/stderr のメッセージで判定する。

## 補足

- `add` は OG 取得後、サーバー側でバックグラウンドに本文抽出 (readability) を走らせる。CLI はその完了を待たない。
- `list -q` の検索はサーバー側で日本語分かち書き (Intl.Segmenter) + FTS5 + bm25 ランキング。
- `logout` は config.json を削除するのみで、サーバー側セッションは無効化しない。
