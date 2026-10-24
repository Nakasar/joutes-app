import "server-only";

import { MeilisearchApiError } from "meilisearch";
import meilisearch, { cardIndexFor } from "@/lib/meilisearch";
import { CARD_LANGUAGES } from "@/lib/constants/card-languages";
import { quoteFilterValue } from "@/lib/cards/search-filters";

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
  const indexConfig = cardIndexFor(gameSlug);
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
    // Comme la recherche de cartes : une langue absente du catalogue retombe
    // sur les cartes anglaises, qui portent alors leur nom traduit.
    filter.push(
      options.lang === "en" ? `lang = "en"` : `lang IN ["en", ${quoteFilterValue(options.lang)}]`
    );
  }
  if (options.setCode) {
    filter.push(`${indexConfig.keys.set} = ${options.setCode}`);
  }

  const search = (attributesToSearchOn: string[]) =>
    index.search(trimmedQuery, {
      limit: 1,
      attributesToSearchOn,
      attributesToRetrieve: ["id", "name"],
      showRankingScore: true,
      filter: filter.length > 0 ? filter : undefined,
    });

  // Une carte imprimée en français porte son nom français : celui des
  // traductions saisies dans l'administration (cf. lib/cards/translations.ts)
  // est cherché avec le nom du catalogue. Un index dont les attributs
  // cherchables sont restreints refuse un attribut qu'il ne connaît pas : on se
  // replie alors sur le seul nom.
  let result;
  try {
    result = await search(["name", ...CARD_LANGUAGES.map((lang) => `translations.${lang}.name`)]);
  } catch (error) {
    if (!(error instanceof MeilisearchApiError) || error.cause?.code !== "invalid_search_attributes_to_search_on") {
      throw error;
    }
    result = await search(["name"]);
  }

  const [top] = result.hits;
  const score = top?._rankingScore;
  return top && score !== undefined && score >= RANKING_SCORE_THRESHOLD ? { id: top.id, name: top.name, score } : null;
}
