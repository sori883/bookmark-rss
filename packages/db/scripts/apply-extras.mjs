// Apply database changes that Drizzle's `push` cannot express.
//
// Right now this is just the FTS5 virtual table for bookmark search, but new
// virtual tables / triggers / extensions should be added to EXTRAS here.
// Every statement MUST be idempotent (CREATE IF NOT EXISTS, etc.) so this can
// run safely against any environment, repeatedly.

import { createClient } from "@libsql/client";

const EXTRAS = [
  {
    name: "bookmark_fts (FTS5 virtual table)",
    sql: `CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_fts USING fts5(
      bookmark_id UNINDEXED,
      title,
      description,
      content_markdown
    )`,
  },
];

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = createClient({ url, authToken });

for (const { name, sql } of EXTRAS) {
  try {
    await client.execute(sql);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}:`, err.message);
    process.exitCode = 1;
  }
}

client.close();
