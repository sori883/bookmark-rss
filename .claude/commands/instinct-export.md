---
description: チームメイトや他のプロジェクトと共有するためにインスティンクトをエクスポートする
---

# インスティンクトエクスポートコマンド

## 前提条件

このコマンドは `continuous-learning-v2` スキルがインストールされていることを前提とする。インストールパスは `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/` または `~/.claude/skills/continuous-learning-v2/`。

実行前に以下の順でチェック:

1. **continuous-learning-v2 のインストール確認**: 未インストールの場合「continuous-learning-v2 がインストールされていません」と報告して停止（exit code: エラー）
2. **インスティンクト0件の確認**: `~/.claude/homunculus/instincts/personal/` 配下にファイルが0件の場合、以下のメッセージを出力して**正常終了**（exit code: 0、エラー扱いではない）:

```
[情報] エクスポート対象のインスティンクトがありません

`~/.claude/homunculus/instincts/personal/` には学習済みのインスティンクトがまだ蓄積されていません。
以下の方法でインスティンクトを蓄積してから再実行してください:

- `/learn` を使用してセッションから手動抽出
- 通常の Claude Code セッションを継続することで自動観察が蓄積
- `/instinct-import <yaml>` で他者のエクスポートを取り込み

現状を確認するには `/instinct-status` を実行してください。
```

3. 0件でない場合、CLI 実行に進む。

インスティンクトを共有可能な形式にエクスポートする。以下に最適:
- チームメイトとの共有
- 新しいマシンへの転送
- プロジェクト慣習への貢献

## 使い方

```
/instinct-export                           # 全個人インスティンクトをエクスポート
/instinct-export --domain testing          # テスト用インスティンクトのみエクスポート
/instinct-export --min-confidence 0.7      # 高確信度のインスティンクトのみエクスポート
/instinct-export --output team-instincts.yaml
```

## 実行内容

1. `~/.claude/homunculus/instincts/personal/` からインスティンクトを読み取り
2. フラグに基づいてフィルタリング
3. 機密情報を除去:
   - セッションIDを削除
   - 絶対ファイルパスを削除（パターンのみ保持）
   - 7日より古い具体的タイムスタンプを削除（観察回数のみ保持）
4. エクスポートファイルを生成

## 出力フォーマット

YAMLファイルを作成:

```yaml
# インスティンクトエクスポート
# 生成日: 2025-01-22
# ソース: personal
# 件数: 12インスティンクト

version: "2.0"
exported_by: "continuous-learning-v2"
export_date: "2025-01-22T10:30:00Z"

instincts:
  - id: prefer-functional-style
    trigger: "新しい関数を書く時"
    action: "クラスよりも関数型パターンを使用"
    confidence: 0.8
    domain: code-style
    observations: 8

  - id: test-first-workflow
    trigger: "新機能を追加する時"
    action: "テストを先に書き、次に実装"
    confidence: 0.9
    domain: testing
    observations: 12

  - id: grep-before-edit
    trigger: "コードを変更する時"
    action: "Grepで検索、Readで確認、次にEdit"
    confidence: 0.7
    domain: workflow
    observations: 6
```

## プライバシーに関する考慮事項

エクスポートに含まれるもの:
- ✅ トリガーパターン
- ✅ アクション
- ✅ 確信度スコア
- ✅ ドメイン
- ✅ 観察回数

エクスポートに含まれないもの:
- ❌ 実際のコードスニペット
- ❌ ファイルパス
- ❌ セッション記録
- ❌ 個人識別情報

## フラグ

- `--domain <名前>`: 指定ドメインのみエクスポート
- `--min-confidence <n>`: 最小確信度閾値（デフォルト: 0.3）
- `--output <ファイル>`: 出力ファイルパス（デフォルト: instincts-export-YYYYMMDD.yaml）
- `--format <yaml|json|md>`: 出力フォーマット（デフォルト: yaml）
- `--include-evidence`: エビデンステキストを含める（デフォルト: 除外）