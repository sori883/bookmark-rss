---
description: ワークフローにチェックポイントを作成、検証、一覧、削除する
---

# チェックポイントコマンド

ワークフローにチェックポイントを作成または検証する。チェックポイントログは `.claude/checkpoints.log` に保存される。

## 使い方

`/checkpoint [create|verify|list|clear] [名前]`

## チェックポイントの作成

チェックポイント作成時:

1. **クリーン状態確認**: `/verify quick` を実行して現在の状態がクリーン（ビルド/lint がパス）であることを確認
   - **失敗時の挙動**: クリーンでない場合はチェックポイント作成を中止し、失敗内容を報告。ユーザーが警告を承知の上で続行を希望する場合は明示的承認を得る（クリーンでない状態をベースラインにすると後続の verify 比較が信頼できなくなるため）

2. **状態保存の選択**:
   - 未コミット変更がある場合: `git stash push -u -m "checkpoint: $CHECKPOINT_NAME"` で保存し、stash 参照（`stash@{N}`）を一時記録
   - すでにクリーンな HEAD の場合: 現在の HEAD SHA をそのまま記録（追加コミット不要）
   - 明示的にコミットマーカーが必要な場合: `git commit --allow-empty -m "checkpoint: $CHECKPOINT_NAME"` で空コミット作成

3. **メタデータ記録**: チェックポイントを `.claude/checkpoints.log` に追記:

```bash
echo "$(date +%Y-%m-%d-%H:%M) | $CHECKPOINT_NAME | $(git rev-parse --short HEAD)" >> .claude/checkpoints.log
```

4. **テスト・カバレッジのスナップショット**（verify 比較のため）: `.claude/checkpoints/` ディレクトリが存在しなければ作成し、`/verify quick` の結果（または `/verify pre-commit`）から取得したテスト合格数とカバレッジを `.claude/checkpoints/<CHECKPOINT_NAME>.snapshot.json` に保存:

```json
{
  "name": "feature-start",
  "sha": "a1b2c3d",
  "timestamp": "2026-05-03-10:15",
  "tests": { "passed": 42, "failed": 0 },
  "coverage": 78.5,
  "build": "PASS",
  "stash_ref": "stash@{0}"
}
```

`stash_ref` は手順2で stash を採用した場合のみ含める（ない場合は省略）。`/verify quick` 側はテスト数・カバレッジを構造化して返す前提（パース不能な場合は `tests: null` 等で記録）。

5. **同名重複の扱い**: 同じ名前のチェックポイントが既に存在する場合、デフォルトでユーザーに「既存を上書きするか、別名で作成するか、キャンセルか」を確認。`--force` 引数があれば無確認で上書き。
   - **上書きを選択した場合**: ログ内の旧 `<NAME>` エントリ行を削除してから新エントリを追記し、旧 `<NAME>.snapshot.json` を上書き。旧 stash があれば `git stash drop` で削除（旧 snapshot のテスト・カバレッジ履歴は失われる旨を警告）

6. **チェックポイント作成完了を報告**: 名前/SHA/タイムスタンプ/snapshot ファイルパス/stash 参照（あれば）を表示

## チェックポイントの検証

チェックポイントに対して検証する場合:

1. **ログから対象エントリを取得**: `.claude/checkpoints.log` から指定名のチェックポイントを検索。同名複数ある場合は最新（タイムスタンプ降順 1件目）を採用
2. **チェックポイント時点のスナップショットを読み込み**: `.claude/checkpoints/$CHECKPOINT_NAME.snapshot.json` からテスト数・カバレッジ・ビルド結果を取得（snapshot が無い場合は警告を出し、変更ファイル数のみ比較する）
3. **現在の状態を計測**:
   - 追加ファイル: `git diff --name-only --diff-filter=A <CP_SHA> HEAD`
   - 変更ファイル: `git diff --name-only --diff-filter=M <CP_SHA> HEAD`
   - 現在のテスト/カバレッジ: `/verify quick`（または `/verify pre-commit`）を実行して取得
4. **差分計算**: スナップショット値と現在値の差を `+X` / `-Y` 形式で算出
5. **報告**:

```
CHECKPOINT COMPARISON: $NAME
============================
チェックポイント: $CP_SHA ($CP_TIMESTAMP)
現在: $CURRENT_SHA

変更ファイル: X (追加: A, 変更: M)
テスト: +Y合格 / -Z失敗 (現在: P/Q, CP時点: P0/Q0)
カバレッジ: +X% / -Y% (現在: C%, CP時点: C0%)
ビルド: [PASS/FAIL]

ステータス: [改善 / 維持 / 退行]
```

### ステータス判定ロジック

3軸（テスト合格数、カバレッジ、ビルド）の差分から以下のルールで判定:

- **改善**: 全軸で同等以上、かつ少なくとも1軸が改善（テスト合格数 +、カバレッジ +、ビルド FAIL→PASS）
- **退行**: いずれか1軸でも悪化（テスト合格数 −、カバレッジ −、ビルド PASS→FAIL）
- **維持**: 全軸で変化なし

### `/verify quick` 失敗時の扱い

verify 実行中に `/verify quick` がビルド失敗等で計測できない場合、ビルドを `FAIL` として記録し、ステータスは「退行」と判定する（テスト・カバレッジは null とする）。

## チェックポイントの一覧

`/checkpoint list` で全チェックポイントをタイムスタンプ降順で表示:
- 名前
- タイムスタンプ
- Git SHA
- ステータス（下記の判定ロジックに基づく）

### ステータス判定ロジック

各チェックポイント SHA `$CP_SHA` と現在 HEAD `$HEAD_SHA` の関係:

| 条件 | コマンド | ステータス |
|------|---------|----------|
| `$CP_SHA == $HEAD_SHA` | 直接比較 | `current` |
| `$CP_SHA` が HEAD の祖先 | `git merge-base --is-ancestor $CP_SHA HEAD` | `behind`（HEAD のほうが進んでいる） |
| HEAD が `$CP_SHA` の祖先 | `git merge-base --is-ancestor HEAD $CP_SHA` | `ahead`（HEAD のほうが古い） |
| どちらでもない | 上記いずれもfalse | `diverged` |

## チェックポイントの削除

`/checkpoint clear` で古いチェックポイントを削除する:

1. `.claude/checkpoints.log` を読み取り、エントリを取得
2. **エントリ数 ≤ 5 の場合**: 削除対象なし。「削除対象なし（保持: N件）」と報告して終了
3. **エントリ数 > 5 の場合**:
   - タイムスタンプ降順でソート（行頭が `YYYY-MM-DD-HH:MM` 形式のため `sort -r` で時系列降順）
   - 最新5件を保持、それ以外を削除対象とする
   - 削除対象の `.claude/checkpoints/<name>.snapshot.json` も合わせて削除
   - ログファイルを上書き
4. 削除した件数と保持した件数を報告（保持された5件の名前一覧も表示）

`clear` は固定ルール（最新5件保持）のため、デフォルトでユーザー確認なし。`--confirm` 引数を渡された場合のみ実行前に確認する。

## ワークフロー

典型的なチェックポイントフロー:

```
[開始] --> /checkpoint create "feature-start"
   |
[実装] --> /checkpoint create "core-done"
   |
[テスト] --> /checkpoint verify "core-done"
   |
[リファクタリング] --> /checkpoint create "refactor-done"
   |
[PR] --> /checkpoint verify "feature-start"
```

## 引数

$ARGUMENTS:
- `create <名前>` - 名前付きチェックポイントを作成
- `verify <名前>` - 名前付きチェックポイントに対して検証
- `list` - 全チェックポイントを表示
- `clear` - 古いチェックポイントを削除（最新5件を保持）