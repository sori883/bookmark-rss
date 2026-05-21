import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";

export const category = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("category_user_id_idx").on(t.userId),
    uniqueIndex("category_user_name_unique").on(t.userId, t.name),
  ],
);

export const feed = sqliteTable(
  "feed",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    siteUrl: text("site_url"),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("feed_user_id_idx").on(t.userId),
    index("feed_category_id_idx").on(t.categoryId),
    uniqueIndex("feed_user_url_unique").on(t.userId, t.url),
  ],
);

export const article = sqliteTable(
  "article",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feedId: text("feed_id")
      .notNull()
      .references(() => feed.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ogImageUrl: text("og_image_url"),
    isRead: integer("is_read", { mode: "boolean" }).default(false).notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("article_user_id_idx").on(t.userId),
    index("article_feed_id_idx").on(t.feedId),
    index("article_is_read_idx").on(t.isRead),
    uniqueIndex("article_feed_url_unique").on(t.feedId, t.url),
  ],
);

export const tag = sqliteTable(
  "tag",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("tag_user_id_idx").on(t.userId),
    uniqueIndex("tag_user_name_unique").on(t.userId, t.name),
  ],
);

export const bookmark = sqliteTable(
  "bookmark",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: text("article_id").references(() => article.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ogImageUrl: text("og_image_url"),
    contentMarkdown: text("content_markdown"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("bookmark_user_id_idx").on(t.userId),
    index("bookmark_article_id_idx").on(t.articleId),
    uniqueIndex("bookmark_user_url_unique").on(t.userId, t.url),
  ],
);

export const bookmarkTag = sqliteTable(
  "bookmark_tag",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmark.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("bookmark_tag_pair_unique").on(t.bookmarkId, t.tagId),
    index("bookmark_tag_tag_id_idx").on(t.tagId),
  ],
);

export const tagRelations = relations(tag, ({ one, many }) => ({
  user: one(user, {
    fields: [tag.userId],
    references: [user.id],
  }),
  bookmarkTags: many(bookmarkTag),
}));

export const bookmarkTagRelations = relations(bookmarkTag, ({ one }) => ({
  bookmark: one(bookmark, {
    fields: [bookmarkTag.bookmarkId],
    references: [bookmark.id],
  }),
  tag: one(tag, {
    fields: [bookmarkTag.tagId],
    references: [tag.id],
  }),
}));

export const categoryRelations = relations(category, ({ one, many }) => ({
  user: one(user, {
    fields: [category.userId],
    references: [user.id],
  }),
  feeds: many(feed),
}));

export const feedRelations = relations(feed, ({ one, many }) => ({
  user: one(user, {
    fields: [feed.userId],
    references: [user.id],
  }),
  category: one(category, {
    fields: [feed.categoryId],
    references: [category.id],
  }),
  articles: many(article),
}));

export const articleRelations = relations(article, ({ one, many }) => ({
  user: one(user, {
    fields: [article.userId],
    references: [user.id],
  }),
  feed: one(feed, {
    fields: [article.feedId],
    references: [feed.id],
  }),
  bookmarks: many(bookmark),
}));

export const bookmarkRelations = relations(bookmark, ({ one }) => ({
  user: one(user, {
    fields: [bookmark.userId],
    references: [user.id],
  }),
  article: one(article, {
    fields: [bookmark.articleId],
    references: [article.id],
  }),
}));

export const userPreference = sqliteTable(
  "user_preference",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recommendationEnabled: integer("recommendation_enabled", {
      mode: "boolean",
    })
      .default(false)
      .notNull(),
    recommendationHour: integer("recommendation_hour").default(8).notNull(),
    discordWebhookUrlEncrypted: text("discord_webhook_url_encrypted"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("user_preference_user_id_unique").on(t.userId)],
);

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, {
    fields: [userPreference.userId],
    references: [user.id],
  }),
}));

export const recommendation = sqliteTable(
  "recommendation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index("recommendation_user_id_idx").on(t.userId),
    uniqueIndex("recommendation_user_date_unique").on(t.userId, t.date),
  ],
);

export const recommendationItem = sqliteTable(
  "recommendation_item",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendation.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["ai", "random"] }).notNull(),
    rank: integer("rank").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index("recommendation_item_recommendation_id_idx").on(t.recommendationId),
    uniqueIndex("recommendation_item_recommendation_rank_unique").on(
      t.recommendationId,
      t.rank,
    ),
  ],
);

export const recommendationRelations = relations(
  recommendation,
  ({ one, many }) => ({
    user: one(user, {
      fields: [recommendation.userId],
      references: [user.id],
    }),
    items: many(recommendationItem),
  }),
);

export const recommendationItemRelations = relations(
  recommendationItem,
  ({ one }) => ({
    recommendation: one(recommendation, {
      fields: [recommendationItem.recommendationId],
      references: [recommendation.id],
    }),
    article: one(article, {
      fields: [recommendationItem.articleId],
      references: [article.id],
    }),
  }),
);

export * from "./auth-schema";
