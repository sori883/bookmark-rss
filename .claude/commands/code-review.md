---
description: コミットされていない変更に対する言語非依存のセキュリティ・品質レビューを実行する
---

# コードレビュー

コミットされていない変更の包括的なセキュリティ・品質レビュー:

1. 変更ファイルを取得: `git diff --name-only HEAD`

2. 各変更ファイルの言語を拡張子から判定し、以下の各カテゴリを言語に対応する形で適用する。

**セキュリティの問題（CRITICAL）:**
- ハードコードされた認証情報、APIキー、トークン、秘密鍵
- 文字列連結によるインジェクション脆弱性（SQL、コマンド、HTML、LDAP、XPath）
- パストラバーサル（`..`を含むパスのサニタイズ漏れ）
- 安全でないファイル操作（権限、シンボリックリンクの追従）
- 言語固有の安全機構違反（正当なコメントによる正当化のない場合に問題化）:
  - Rust: 正当な理由のない `unsafe` ブロック
  - TypeScript: `as any`、`@ts-ignore`、`@ts-nocheck`、`eval()`
  - Python: `eval()`、`exec()`、`pickle.loads()` を信頼できない入力に対して使用、`shell=True` を変数引数で使用
  - Java: `Runtime.exec()` を変数引数で使用、`ObjectInputStream.readObject()` を信頼できないストリームに対して
  - Go: `unsafe.` パッケージの正当な理由のない使用
- 入力バリデーションの欠如（外部入力を直接処理）

**コード品質（HIGH）:**
- 50行を超える関数（言語に関わらず）
- 800行を超えるファイル
- 4レベルを超えるネスト深度
- パニックを起こす可能性のあるエラー処理:
  - Rust: `src/` 配下の `.unwrap()` / `.expect()` / `panic!()`（テストコード除外）
  - TypeScript: 非ヌル断言 `!` の濫用、未処理の Promise rejection
  - Python: bare `except:`、エラーの黙殺
  - Go: `_ = err` のようなエラー破棄
- 適切なエラーハンドリング欠如（戻り値型/例外の意図しない無視）
- 未完成マーカーが本番コードに残存:
  - Rust: `todo!()` / `unimplemented!()`
  - 共通: `TODO`/`FIXME`/`XXX`/`HACK` コメント、`throw new Error("not implemented")`
- パフォーマンス:
  - Rust: 不要な `.clone()`、借用で済む箇所での所有権取得
  - TypeScript: ホットパスでの spread 演算子の濫用、ループ内での不要なオブジェクト作成
  - Python: ループ内の attribute lookup の繰り返し、リスト連結の `+=` 濫用

**ベストプラクティス（MEDIUM）:**
- パブリックAPIのドキュメントコメント欠如:
  - Rust: `///`
  - TypeScript: JSDoc
  - Python: docstring
  - Java: Javadoc
  - Go: パッケージ/exported 識別子のコメント
- 未使用 import / dead code（言語のlinterが検出するもの）
- 不必要な可変宣言:
  - Rust: 不要な `mut`
  - TypeScript/JS: `const` で済む箇所の `let`
- 新しいコードのテスト欠如
- linter抑制の濫用:
  - Rust: `#[allow(...)]`
  - TypeScript: `// eslint-disable-line`
  - Python: `# noqa`

3. レポートを生成:
   - 重要度: CRITICAL、HIGH、MEDIUM、LOW
   - ファイルの場所と行番号
   - 問題の説明
   - 修正の提案

4. CRITICALまたはHIGHの問題がある場合はコミットをブロック

セキュリティ脆弱性のあるコードを承認してはならない。検出言語に該当しない項目はスキップする（誤検知を避けるため）。