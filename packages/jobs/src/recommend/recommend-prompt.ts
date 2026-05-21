/**
 * Prompt template for the daily recommendation generation job.
 *
 * Edit this file when you want to tune the recommendation behavior:
 *   - voice / persona of the curator
 *   - what attributes of bookmarks / candidates are emphasized
 *   - how `reason` should be phrased
 *
 * Placeholders (replaced at runtime by `buildRecommendationPrompt`):
 *   {{count}}       — how many articles the model should pick
 *   {{bookmarks}}   — list of the user's recent bookmarks (one per line),
 *                     or "(ブックマークなし)" if empty
 *   {{candidates}}  — list of unread candidate articles (one per line)
 */
export const RECOMMENDATION_PROMPT_TEMPLATE = `あなたは記事キュレーターです。
ユーザーがブックマークした記事から興味関心を読み取り、未読の候補記事から特に気に入りそうな記事を {{count}} 件選んでください。

[ユーザーのブックマーク (興味関心の参考)]
{{bookmarks}}

[未読候補記事]
{{candidates}}

picks 配列で id (上記候補の id) と reason (日本語1〜2文) を返してください。`;

export interface RecommendationPromptInputs {
  count: number;
  bookmarks: { title: string; description: string | null }[];
  candidates: { id: string; title: string; description: string | null }[];
}

const formatBookmarks = (
  bookmarks: RecommendationPromptInputs["bookmarks"],
): string => {
  if (bookmarks.length === 0) {
    return "(ブックマークなし)";
  }
  return bookmarks
    .map((b) => `- ${b.title}${b.description ? ` — ${b.description}` : ""}`)
    .join("\n");
};

const formatCandidates = (
  candidates: RecommendationPromptInputs["candidates"],
): string =>
  candidates
    .map(
      (c) =>
        `- id=${c.id} | ${c.title}${c.description ? ` — ${c.description}` : ""}`,
    )
    .join("\n");

export const buildRecommendationPrompt = ({
  count,
  bookmarks,
  candidates,
}: RecommendationPromptInputs): string =>
  RECOMMENDATION_PROMPT_TEMPLATE.replaceAll("{{count}}", String(count))
    .replaceAll("{{bookmarks}}", formatBookmarks(bookmarks))
    .replaceAll("{{candidates}}", formatCandidates(candidates));
