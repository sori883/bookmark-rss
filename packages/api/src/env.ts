import type { Session } from "@acme/auth";
import type { DbType } from "@acme/db/client";
import type { ArticleFetcher } from "@acme/jobs";

export type { ArticleFetcher };

export interface FeedMetadata {
  title: string;
  siteUrl: string | null;
  /** The actual RSS/Atom URL discovered (may differ from the input URL). */
  feedUrl: string;
}

export interface FeedFetcher {
  fetchMetadata(url: string): Promise<FeedMetadata>;
}

export interface OgMetadata {
  title: string;
  description: string | null;
  imageUrl: string | null;
}

export interface OgFetcher {
  fetch(url: string): Promise<OgMetadata>;
}

export interface JobsDispatcher {
  triggerFeedIngest(feedIds: string[]): Promise<void>;
  triggerBookmarkExtract(bookmarkIds: string[]): Promise<void>;
}

export interface AppEnv {
  Variables: {
    db: DbType;
    user: Session["user"] | null;
    session: Session["session"] | null;
    feedFetcher: FeedFetcher;
    ogFetcher: OgFetcher;
    articleFetcher: ArticleFetcher;
    jobsDispatcher: JobsDispatcher;
    encryptionMasterKey: string;
  };
}
