import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";

import type { DbType } from "@acme/db/client";
import * as schema from "@acme/db/schema";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  db: DbType;
  authUrl: string;
  secret: string | undefined;
  trustedUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  extraPlugins?: TExtraPlugins;
}) {
  const config = {
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema,
    }),
    baseURL: options.authUrl,
    secret: options.secret,
    trustedOrigins: [options.trustedUrl, "chrome-extension://*"],
    session: {
      // Cookie の Max-Age はブラウザ／better-call の制約で最大 400 日
      // (34,560,000 秒) に制限される。これを超える値を設定するとセッション
      // Cookie 発行時に例外となり、OAuth コールバックが失敗する。
      // そのため上限いっぱいの 400 日を設定し、下記 updateAge による
      // スライディング更新で「無期限相当」（アクセスし続ける限り失効しない）
      // を実現する。
      expiresIn: 60 * 60 * 24 * 400,
      // アクセスのたびに有効期限を先送りするため、更新間隔は短めにする。
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      bearer(),
      deviceAuthorization({ schema: {} }),
      jwt({
        jwt: {
          definePayload: ({ user }) => ({ id: user.id }),
        },
      }),
      ...(options.extraPlugins ?? []),
    ],
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
        redirectURI: `${options.authUrl}/api/auth/callback/google`,
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
