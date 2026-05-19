# cf-template

TanStack Start + Hono + Better Auth + Drizzle ORM + libSQL (Turso) によるモノレポ構成の Web アプリケーション。Cloudflare Workers 向けにビルド・デプロイされる。

## 技術スタック

| レイヤ         | 採用技術                                                 |
| -------------- | -------------------------------------------------------- |
| フロントエンド | TanStack Start, TanStack Router, Tailwind CSS v4         |
| API            | Hono                                                     |
| 認証           | Better Auth (Google OAuth, bearer, device authorization) |
| DB / ORM       | libSQL (Turso) + Drizzle ORM + drizzle-zod               |

## プロジェクト構成

```
cf-template/
├── apps/
│   └── web/                    # TanStack Start アプリ (Cloudflare Workers)
│       ├── src/
│       │   ├── routes/         # ファイルベースルーティング
│       │   ├── auth/
│       │   ├── components/
│       │   └── lib/
│       └── wrangler.jsonc
├── packages/
│   ├── api/                    # Hono ベースの API (@acme/api)
│   │   └── src/
│   │       ├── index.ts        # createApp(): Hono ルータ
│   │       ├── middleware/     # injectDb, loadSession, requireAuth
│   │       └── env.ts
│   ├── auth/                   # Better Auth ラッパ (@acme/auth)
│   │   └── src/
│   │       ├── index.ts        # initAuth()
│   │       ├── client.ts
│   │       └── tanstack-start.ts
│   └── db/                     # Drizzle ORM スキーマ / クライアント (@acme/db)
│       ├── src/
│       │   ├── schema.ts       # アプリ用テーブル定義
│       │   ├── auth-schema.ts  # Better Auth 生成スキーマ
│       │   └── client.ts
│       └── drizzle.config.ts
├── tooling/                    # 共有設定パッケージ
│   ├── eslint/                 # @acme/eslint-config
│   ├── prettier/               # @acme/prettier-config
│   ├── tailwind/               # @acme/tailwind-config
│   ├── typescript/             # @acme/tsconfig
│   └── github/
├── .datastore/                 # ローカル Turso の SQLite ファイル置き場
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## セットアップ

### 前提条件

- Node.js `24.15.0` (`.nvmrc` 参照)
- pnpm `10.19.0`
- [Turso CLI](https://docs.turso.tech/cli/installation) (ローカル開発で `turso dev` を利用)

### 1. 環境変数

`.env.example` をコピーして `.env` を作成し、値を埋める。

```sh
cp .env.example .env
```

```dotenv
DATABASE_URL='http://127.0.0.1:8080'
DATABASE_AUTH_TOKEN='local'

BETTER_AUTH_URL='http://localhost:3000'
BETTER_AUTH_SECRET=''
BETTER_TRUSTED_URL='http://localhost:3000'
AUTH_GOOGLE_ID=''
AUTH_GOOGLE_SECRET=''
```

- `BETTER_AUTH_SECRET`: 任意のランダム文字列を設定
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google Cloud Console で OAuth クライアントを作成して取得

### 2. ローカル DB (Turso) の起動

別ターミナルで以下を実行し、ローカル libSQL サーバを `http://127.0.0.1:8080` で起動する。

```sh
turso dev --db-file .datastore/db.sqlite
```

DB ファイルは `.datastore/db.sqlite` に永続化される (`.gitignore` 済み)。

### 3. 依存パッケージのインストール

```sh
pnpm install
```

### 4. DB スキーマの反映

```sh
pnpm db:push
```

Better Auth のスキーマを再生成したい場合:

```sh
pnpm auth:generate
```

### 5. 開発サーバの起動

```sh
pnpm dev
```

- Web: <http://localhost:3000>

## デプロイ (Cloudflare Workers)

`apps/web` ディレクトリで以下を実行する。

```sh
pnpm -F @acme/web cf-deploy
```

- `wrangler.jsonc` に Worker 設定
- `.env` の値が `wrangler deploy --secrets-file` で Secrets として登録される
