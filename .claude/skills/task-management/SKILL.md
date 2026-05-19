---
name: task-management
description: モノレポでサービスごとに分けた todos CLI タスクを、5フェーズ（設計→テスト設計→実装→テスト→完了）で進める実行手順。親タスク作成、サブタスク分割、ステータス遷移、サービス別検証コマンド（pnpm/uv/cargo）、Conventional Commits + gh PR 作成までを 1 ファイルでカバー。
---

# タスク管理スキル

このスキルは **5 フェーズワークフロー**で `todos` CLI タスクを進める運用テンプレートである。下記のテンプレートとコマンドだけで通常タスクは完結する。

**正の所在（衝突した場合の優先順位）**:
1. `todos --help` / `todos <cmd> --help` — コマンド仕様の正
2. `.claude/rules/dev-workflow.md`（存在する場合） — プロジェクト固有のワークフロー上書き
3. 本スキル — 上記がない場合のデフォルト手順

## サービス別プロジェクト

このモノレポではサービスごとに `--project` を分ける:

```
auth, feed, ai, notification, web, cli, db, infra, openapi
```

## タスク作成テンプレート

```bash
# 1. 親タスク作成（サービス名をprojectに指定）
todos add "機能名: 概要" --label <category> --project <service> --created-by ai
# label: feature | bug | improvement | refactor | documentation | chore
# service: auth | feed | ai | notification | web | cli | db

# 2. 親タスク ID 取得（前方一致 prefix を使用）
todos list -P <service> --format json
# 出力例（最低限のフィールド）:
# [
#   { "id": "abc12345-...", "title": "...", "status": "todo", "parent_id": null, "labels": ["feature"] },
#   ...
# ]
# → id の先頭 5〜8 文字を <PREFIX> として以降使う
# 注: todos CLI は前方一致を受け付けるので、ステータス遷移コマンドも `todos status abc12 done` のように prefix で OK。
#     UUID フル指定でも動くが、可読性のため prefix に統一する。

# 3. サブタスク一括作成（Phase 順）
todos add "設計・計画" --parent <PREFIX> --created-by ai
todos add "テスト設計" --parent <PREFIX> --created-by ai
todos add "実装: xxx" --parent <PREFIX> --created-by ai   # 実装単位ごとに分割
todos add "テスト実装・実行" --parent <PREFIX> --created-by ai
todos add "検証・レビュー" --parent <PREFIX> --created-by ai
```

## フェーズ実行パターン

各フェーズ開始時に `todos status <ID> in_progress`、完了時に `todos status <ID> done`。

### Phase 1-2: 設計・テスト設計（承認ゲート）

```bash
# テストケースを content に記録
todos edit <ID> --content "1. 正常系: ... 2. 異常系: ... 3. 境界値: ..."
```

ユーザーに設計/テストケースを提示 → **承認を得てから** done にする。

### Phase 3: 実装（1サブタスクずつ）

```bash
# Phase 3 開始時にフィーチャーブランチを作成（コミットは Phase 5 でまとめて行う）
git checkout -b feature/<service>-<feature>

todos status <ID> in_progress   # 着手
# コード実装 → ビルドパス
todos status <ID> done          # 完了してから次へ
```

### Phase 4: テスト・検証

サービスに応じたコマンドを実行（cd 先のディレクトリ規約はモノレポによって異なる: `services/` はバックエンド、`apps/` はクライアント側）:

```bash
# TypeScript サービス（auth, feed, notification） — services/ 配下
cd services/<name> && pnpm lint && pnpm typecheck && pnpm test

# Python サービス（ai） — services/ 配下
cd services/ai && uv run ruff check . && uv run pyright . && uv run pytest

# Rust（cli） — apps/ 配下
cd apps/cli && cargo fmt --check && cargo clippy -- -D warnings && cargo test

# フロントエンド（web） — apps/ 配下
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

**Phase 4 のスコープ**: 検証コマンドの実行までで完結。コマンドが pass したら `todos status <ID> done`。

### Phase 5: 検証・完了 — PR 作成と親タスク close

Phase 4 が pass したことを前提に、Phase 5 では以下を行う:

```bash
# 1. ブランチ作成と push、コミット作成（次節「Git / GitHub」参照）
# 2. PR を作成し、レビュー観点を共有
# 3. 全サブタスク done 確認後に親タスクを close
todos list -P <service> --all          # 全サブタスクが done か確認
todos status <PARENT_ID> done
```

## 進捗確認

```bash
todos list -P <service>              # サービス内タスク一覧
todos list -P <service> --all        # done/cancelled 含む
todos show <ID>                      # 個別タスク詳細
todos stats                          # 全体統計
```

## Git / GitHub（gh CLI）

```bash
# フィーチャーブランチ作成
git checkout -b feature/<service>-<feature>

# コミット（Conventional Commits）
git add <files>
git commit -m "feat(<service>): 説明"

# PR作成
gh pr create --title "feat(<service>): 説明" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...
EOF
)"

# PR一覧・詳細
gh pr list
gh pr view <number>
gh pr merge <number>
```
