import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { article } from "@acme/db/schema";

import { auth } from "~/auth/server";
import { dbClient } from "~/lib/db-client";

const redirectTo = (location: string, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

const handleRead = async (request: Request, articleId: string) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    const returnTo = `/r/${articleId}`;
    return redirectTo(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const db = dbClient();
  const row = await db
    .select({ id: article.id, url: article.url })
    .from(article)
    .where(and(eq(article.id, articleId), eq(article.userId, session.user.id)))
    .get();
  if (!row) {
    return new Response("Article not found", { status: 404 });
  }

  await db.update(article).set({ isRead: true }).where(eq(article.id, row.id));

  return redirectTo(row.url);
};

export const Route = createFileRoute("/r/$articleId")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleRead(request, params.articleId),
    },
  },
});
