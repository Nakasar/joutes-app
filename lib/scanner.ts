import "server-only";

import meilisearch, { indexes } from "@/lib/meilisearch";

type CardNameHit = { id: string; name: string };
export type ScannerMatch = { id: string; name: string; score: number };

// Meilisearch's built-in typo tolerance already fuzzy-matches OCR/AI noise,
// so this only filters out the low-confidence hits it still returns when
// the query doesn't correspond to any card name.
const RANKING_SCORE_THRESHOLD = 0.55;

/**
 * Fuzzy-matches a single card name against a game's Meilisearch index,
 * optionally narrowed to a language and/or set. Shared by the OCR match
 * route and the AI identification route.
 */
export async function matchCardNameInMeilisearch(
  gameSlug: string | undefined,
  query: string,
  options: { lang?: string | null; setCode?: string | null } = {}
): Promise<ScannerMatch | null> {
  const indexConfig = gameSlug ? indexes[gameSlug] : undefined;
  if (!indexConfig) {
    return null;
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const index = meilisearch.index<CardNameHit>(indexConfig.name);

  const filter: string[] = [];
  if (options.lang) {
    filter.push(`lang = ${options.lang}`);
  }
  if (options.setCode) {
    filter.push(`${indexConfig.keys.set} = ${options.setCode}`);
  }

  const result = await index.search(trimmedQuery, {
    limit: 1,
    attributesToSearchOn: ["name"],
    attributesToRetrieve: ["id", "name"],
    showRankingScore: true,
    filter: filter.length > 0 ? filter : undefined,
  });

  const [top] = result.hits;
  const score = top?._rankingScore;
  return top && score !== undefined && score >= RANKING_SCORE_THRESHOLD ? { id: top.id, name: top.name, score } : null;
}
