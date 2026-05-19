---
description: 学習済みインスティンクトの確信度レベルを全て表示する
---

# インスティンクトステータスコマンド

学習済みの全インスティンクトをドメインごとにグループ化し、確信度スコアと共に表示する。

## 前提条件

このコマンドは `continuous-learning-v2` スキルがインストールされていることを前提とする。インストールパスは `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/` または `~/.claude/skills/continuous-learning-v2/`。Python 3 が必要。インスティンクトが0件の場合、「学習済みインスティンクトがありません」と報告して終了する。

## 実装

プラグインルートパスを使用してインスティンクトCLIを実行:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" status
```

`CLAUDE_PLUGIN_ROOT` が設定されていない場合（手動インストール）:

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py status
```

## 使い方

```
/instinct-status
/instinct-status --domain code-style
/instinct-status --low-confidence
```

## 実行内容

1. `~/.claude/homunculus/instincts/personal/` から全インスティンクトファイルを読み取り
2. `~/.claude/homunculus/instincts/inherited/` から継承インスティンクトを読み取り
3. **フラグ適用**:
   - `--domain <名前>`: 指定ドメインのみフィルタ（他ドメインは出力に含めない）
   - `--low-confidence`: 確信度 < 0.5 のみ
   - `--high-confidence`: 確信度 ≥ 0.7 のみ
   - `--source <タイプ>`: 指定ソースのみ
4. **フィルタ結果が0件の場合**: 「指定条件に該当するインスティンクトがありません（全体: N件）」と報告して正常終了
5. ドメインごとにグループ化し、確信度バーと共に表示
6. **合計欄の数値**: フィルタ後の数値を表示し、フィルタが適用されている場合は `(全体: N)` を併記する。表記は `合計: M インスティンクト (全体: N)` の形式で統一する

### 確信度バーの描画ルール

- バーは10セル固定。各セルは10%相当
- 塗りつぶし: `█`、未塗りつぶし: `░`
- 確信度を 0.0〜1.0 の範囲とし、`round(confidence * 10)` で塗りつぶしセル数を決定
- 例: 0.78 → 8セル塗りつぶし → `████████░░`、表示は `78%`

## 出力フォーマット

```
📊 インスティンクトステータス
==================

## コードスタイル（4インスティンクト）

### prefer-functional-style
トリガー: 新しい関数を書く時
アクション: クラスよりも関数型パターンを使用
確信度: ████████░░ 80%
ソース: session-observation | 最終更新: 2025-01-22

### use-path-aliases
トリガー: モジュールをインポートする時
アクション: 相対インポートの代わりに@/パスエイリアスを使用
確信度: ██████░░░░ 60%
ソース: repo-analysis (github.com/acme/webapp) | 最終更新: 2026-04-10

## テスト（2インスティンクト）

### test-first-workflow
トリガー: 新機能を追加する時
アクション: テストを先に書き、次に実装
確信度: █████████░ 90%
ソース: session-observation | 最終更新: 2026-04-25

## ワークフロー（3インスティンクト）

### grep-before-edit
トリガー: コードを変更する時
アクション: Grepで検索、Readで確認、次にEdit
確信度: ███████░░░ 70%
ソース: session-observation | 最終更新: 2026-04-28

### follow-team-style
トリガー: PRレビュー時
アクション: チームのスタイルガイドを優先
確信度: ████████░░ 80%
ソース: inherited (元: team-instincts.yaml) | 最終更新: 2026-04-15

---
合計: 9インスティンクト（4個人、5継承）
オブザーバー: 実行中（最終分析: 5分前）
```

### 出力規約

- 各インスティンクトには `最終更新: YYYY-MM-DD` を**必須**で表示
- ソース表示形式:
  - `session-observation`
  - `repo-analysis (<repo URL>)`
  - `inherited (元: <親プロファイル名 or ファイル名>)`
- `--domain` フィルタ時の合計欄: `合計: 3インスティンクト（フィルタ後）/ 全体: 9インスティンクト`

## フラグ

- `--domain <名前>`: ドメインでフィルタ（code-style、testing、gitなど）
- `--low-confidence`: 確信度0.5未満のインスティンクトのみ表示
- `--high-confidence`: 確信度0.7以上のインスティンクトのみ表示
- `--source <タイプ>`: ソースでフィルタ（session-observation、repo-analysis、inherited）
- `--json`: プログラム利用用にJSON形式で出力