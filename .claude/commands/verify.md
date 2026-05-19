---
description: プロジェクトのビルド・lint・format・テスト・セキュリティ監査を順次実行し、PR可否を判定する
---

# 検証コマンド

現在のコードベースの状態に対して包括的な検証を実行する。

## 言語/ツール検出

実行前にプロジェクトのマニフェストから言語とツールを検出する。検出結果に応じて下記の各ステップを対応するコマンドで実行する。

| マニフェスト | 言語 | ビルド | Lint | Format | Test |
|------------|------|--------|------|--------|------|
| `Cargo.toml` | Rust | `cargo build` | `cargo clippy --all-targets --all-features -- -D warnings` | `cargo fmt --all -- --check` | `cargo test` |
| `package.json` | Node/TS | `npm run build` (or pnpm/yarn/bun) | `npm run lint` | `npm run format:check` (or prettier --check) | `npm test` |
| `pyproject.toml` / `setup.py` | Python | `python -m build` | `ruff check .` (or `flake8`) | `ruff format --check` (or `black --check`) | `pytest` |
| `go.mod` | Go | `go build ./...` | `go vet ./...` + `staticcheck ./...` | `gofmt -l .` | `go test ./...` |
| `pom.xml` / `build.gradle` | Java/Kotlin | `mvn compile` / `gradle build` | `mvn checkstyle:check` | `mvn spotless:check` | `mvn test` / `gradle test` |
| その他 | - | プロジェクトの README/Makefile/CI設定からビルド・テストコマンドを読み取る | 同左 | 同左 | 同左 |

### 複数マニフェスト（モノレポ）の扱い

複数のマニフェストが存在する場合は以下のルールで処理する:

1. **ルートにworkspace定義がある場合**（`package.json` に `workspaces`、`Cargo.toml` に `[workspace]`、`go.work`、pnpm `pnpm-workspace.yaml` 等）:
   - **ビルド/Lint/Format/Test の実行**: workspace 横断コマンド（`pnpm -r`、`cargo build --workspace`、`go build ./...`、`mvn -T 1C verify` 等）を採用
   - **セキュリティ監査**: 各サブパッケージのマニフェストから検出された全言語に対して、該当ディレクトリスコープで言語固有チェックを並列適用（ルート優先ルールはここでは適用しない）

2. **ルートが単一プロジェクトのマニフェストの場合**: ルートのマニフェストに対応する言語のコマンドのみを使用。サブディレクトリの異なる言語は副次的に扱い、セキュリティ監査でのみ言語固有チェックを適用する。

3. **マニフェストなし**: README/Makefile/CI 設定からビルド・テストコマンドを推論。推論できない言語は該当ステップをスキップ。

検出できない言語は該当ステップを `-` で表記してスキップする。

## 手順

以下の正確な順序で検証を実行:

1. **ビルドチェック**
   - 検出されたビルドコマンドを実行
   - 失敗した場合はエラーを報告して停止

2. **Lintチェック**
   - 検出されたlinterを実行
   - 全警告をファイル:行番号で報告

3. **フォーマットチェック**
   - 検出されたformatterの check モードを実行
   - フォーマット差分を報告

4. **テストスイート**
   - 検出されたテストランナーを実行
   - パス/フェイル数を報告

5. **セキュリティ監査**
   - ソースファイル内のハードコードされたシークレット（API キー、トークン、`-----BEGIN.*PRIVATE KEY-----`、`AKIA[0-9A-Z]{16}` 等）を grep
   - 言語固有の安全機構違反を検出:
     - Rust: `unsafe` ブロック、`src/` 配下の `.unwrap()`（テストコード除外）
     - TypeScript: `as any`、`@ts-ignore`、`@ts-nocheck`
     - Python: `# type: ignore`、`eval(`、`exec(`
     - Go: `unsafe.` パッケージ参照
     - 共通: SQL文字列連結、`shell=True` (Python)、`child_process.exec` の動的引数
   - 検出言語に該当しない項目はスキップ

6. **Gitステータス**
   - コミットされていない変更を表示
   - 最後のコミット以降に変更されたファイルを表示

## 出力

簡潔な検証レポートを生成:

```
VERIFICATION: [PASS/FAIL/PARTIAL]
言語: [検出された言語（モノレポの場合は併記）]

Build:    [OK / FAIL / -]
Lint:     [OK / X件の警告 / -]
Format:   [OK / 差分あり / -]
Tests:    [X/Yパス / -]
Security: [OK / X件検出 / -]

PR準備完了: [YES/NO]
```

### フィールド表記ルール

- 各ステップの結果欄:
  - `OK`: 実行して問題なし
  - `FAIL` / `X件の警告` / `差分あり` / `X件検出`: 実行して問題あり（具体値を併記）
  - `-`: 当該モードでスキップした、または検出ツールが利用不可
- スキップしたステップには末尾に括弧で理由を補記（例: `Tests: - (skipped: quick mode)`）

### 集約ルール（VERIFICATION フィールド）

- `PASS`: 実行された全ステップが OK
- `FAIL`: 実行されたステップに1つでも FAIL/警告/差分/検出ありがある
- `PARTIAL`: スキップが発生したモード（quick/pre-commit）で、実行されたステップは全て OK だが未実行ステップが残っている

### PR準備完了フィールド

- `YES`: VERIFICATION が `PASS` かつ `pre-pr` または `full` モードで全ステップを実行済み
- `NO`: VERIFICATION が `FAIL`/`PARTIAL` の場合、または quick/pre-commit モードのため未確認のステップがある場合

クリティカルな問題がある場合は、修正提案とともにリスト化する。

## 引数

$ARGUMENTS の指定可能な値:
- `quick` - ビルド + lint のみ
- `full` - 全チェック（デフォルト）
- `pre-commit` - ビルド + lint + format + テスト
- `pre-pr` - 全チェック + セキュリティスキャン