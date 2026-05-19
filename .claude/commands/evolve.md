---
description: 関連するインスティンクトをスキル、コマンド、またはエージェントにクラスタリングする
---

# Evolveコマンド

## ステップ0: 前提条件チェック（最初に必ず実行）

引数解析より**前**に以下を順に確認する。失敗した場合は該当エラーを出力して即停止し、後続ステップ（CLI実行・引数解析）には進まない。

1. **continuous-learning-v2 スキルの存在確認**:

```bash
[ -d "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2" ] || [ -d "$HOME/.claude/skills/continuous-learning-v2" ]
```

両方とも存在しない場合は以下を出力して停止:

```
[エラー] continuous-learning-v2 がインストールされていません

確認したパス:
  - ${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/
  - ~/.claude/skills/continuous-learning-v2/

インストール方法:
  - プラグインとしてインストール: continuous-learning-v2 を含むプラグインを `claude` の plugin install 経由で追加
  - 手動インストール: continuous-learning-v2 のリポジトリを ~/.claude/skills/ 配下に配置

このコマンドは continuous-learning-v2 スキルに依存するため停止します。
```

2. **Python 3 の存在確認**:

```bash
command -v python3 >/dev/null 2>&1
```

存在しない場合は以下を出力して停止:

```
[エラー] python3 が PATH に見つかりません
このコマンドは Python 3 を必要とします。インストール後に再実行してください。
```

3. 前提条件が全て満たされた場合のみ、ステップ1（CLI実行）に進む。

## ステップ1: CLI 実行

存在確認の結果、利用可能なパスを優先して使用（`${CLAUDE_PLUGIN_ROOT}` 配下を優先、なければ `~/.claude/`）:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" evolve [--execute]
```

`CLAUDE_PLUGIN_ROOT` が設定されていない場合:

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py evolve [--execute]
```

引数（`--domain`、`--threshold`、`--execute` 等）はそのまま CLI に渡す。`--execute` フラグなしの場合はプレビューのみ（ファイルは作成されない）。

インスティンクトを分析し、関連するものをより高レベルの構造にクラスタリングする:
- **コマンド**: インスティンクトがユーザー起動のアクションを記述している場合
- **スキル**: インスティンクトが自動トリガーされる動作を記述している場合
- **エージェント**: インスティンクトが複雑な複数ステップのプロセスを記述している場合

## 使い方

```
/evolve                    # 全インスティンクトを分析し進化を提案
/evolve --domain testing   # テストドメインのインスティンクトのみ進化
/evolve --dry-run          # 作成せずにプレビューのみ表示
/evolve --threshold 5      # クラスタリングに5件以上の関連インスティンクトを要求
```

## 進化ルール

### → コマンド（ユーザー起動）
インスティンクトがユーザーが明示的に要求するアクションを記述している場合:
- 「ユーザーが～を依頼した時」に関する複数のインスティンクト
- 「新しいXを作成する時」のようなトリガーを持つインスティンクト
- 繰り返し可能なシーケンスに従うインスティンクト

例:
- `new-table-step1`: 「データベーステーブルを追加する時、マイグレーションを作成」
- `new-table-step2`: 「データベーステーブルを追加する時、スキーマを更新」
- `new-table-step3`: 「データベーステーブルを追加する時、型を再生成」

→ 作成: `/new-table` コマンド

### → スキル（自動トリガー）
インスティンクトが自動的に発動すべき動作を記述している場合:
- パターンマッチングによるトリガー
- エラーハンドリングの応答
- コードスタイルの強制

例:
- `prefer-functional`: 「関数を書く時、関数型スタイルを優先」
- `use-immutable`: 「状態を変更する時、イミュータブルパターンを使用」
- `avoid-classes`: 「モジュールを設計する時、クラスベースの設計を避ける」

→ 作成: `functional-patterns` スキル

### → エージェント（深さ/分離が必要）
インスティンクトが分離が有益な複雑な複数ステップのプロセスを記述している場合:
- デバッグワークフロー
- リファクタリングシーケンス
- 調査タスク

例:
- `debug-step1`: 「デバッグ時、まずログを確認」
- `debug-step2`: 「デバッグ時、障害コンポーネントを分離」
- `debug-step3`: 「デバッグ時、最小限の再現を作成」
- `debug-step4`: 「デバッグ時、テストで修正を検証」

→ 作成: `debugger` エージェント

## 実行内容

1. `~/.claude/homunculus/instincts/` から全インスティンクトを読み取り
2. インスティンクトを以下でグループ化:
   - ドメインの類似性
   - トリガーパターンの重複
   - アクションシーケンスの関連性
3. 3件以上の関連インスティンクトの各クラスターについて:
   - 進化タイプを決定（コマンド/スキル/エージェント）
   - 適切なファイルを生成
   - `~/.claude/homunculus/evolved/{commands,skills,agents}/` に保存
4. 進化した構造をソースインスティンクトにリンク

## 出力フォーマット

```
🧬 進化分析
==================

進化の準備ができた3つのクラスターが見つかりました:

## クラスター1: データベースマイグレーションワークフロー
インスティンクト: new-table-migration, update-schema, regenerate-types
タイプ: コマンド
確信度: 85%（12回の観察に基づく）

作成予定: /new-table コマンド
ファイル:
  - ~/.claude/homunculus/evolved/commands/new-table.md

## クラスター2: 関数型コードスタイル
インスティンクト: prefer-functional, use-immutable, avoid-classes, pure-functions
タイプ: スキル
確信度: 78%（8回の観察に基づく）

作成予定: functional-patterns スキル
ファイル:
  - ~/.claude/homunculus/evolved/skills/functional-patterns.md

## クラスター3: デバッグプロセス
インスティンクト: debug-check-logs, debug-isolate, debug-reproduce, debug-verify
タイプ: エージェント
確信度: 72%（6回の観察に基づく）

作成予定: debugger エージェント
ファイル:
  - ~/.claude/homunculus/evolved/agents/debugger.md

---
これらのファイルを作成するには `/evolve --execute` を実行してください。
```

## フラグ

- `--execute`: 進化した構造を実際に作成（デフォルトはプレビュー）
- `--dry-run`: 明示的にプレビューモードを指定（`--execute` がない場合と同じ）
- `--domain <名前>`: 指定ドメインのインスティンクトのみ進化
- `--threshold <n>`: クラスター形成に必要な最小インスティンクト数（デフォルト: 3）
- `--type <command|skill|agent>`: 指定タイプのみ作成

注: 旧仕様では `--generate` フラグを参照していたが、現行は `--execute` に統一されている。CLI 実装が両方を受け付けるかは実装依存。

## 生成されるファイルフォーマット

### コマンド
```markdown
---
name: new-table
description: マイグレーション、スキーマ更新、型生成を含む新しいデータベーステーブルを作成
command: /new-table
evolved_from:
  - new-table-migration
  - update-schema
  - regenerate-types
---

# New Tableコマンド

[クラスタリングされたインスティンクトに基づいて生成されたコンテンツ]

## ステップ
1. ...
2. ...
```

### スキル
```markdown
---
name: functional-patterns
description: 関数型プログラミングパターンを強制
evolved_from:
  - prefer-functional
  - use-immutable
  - avoid-classes
---

# Functional Patternsスキル

[クラスタリングされたインスティンクトに基づいて生成されたコンテンツ]
```

### エージェント
```markdown
---
name: debugger
description: 体系的なデバッグエージェント
model: sonnet
evolved_from:
  - debug-check-logs
  - debug-isolate
  - debug-reproduce
---

# Debuggerエージェント

[クラスタリングされたインスティンクトに基づいて生成されたコンテンツ]
```