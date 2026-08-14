import {Meilisearch, MeilisearchApiError} from "meilisearch";

const meilisearch = new Meilisearch({
  host: process.env.MEILISEARCH_ENDPOINT ?? 'localhost:7700',
  apiKey: process.env.MEILISEARCH_API_KEY ?? undefined,
});

export default meilisearch;

export type CardIndexConfig = { name: string; keys: { set: string; collectorNumber: string } };

export const indexes: { [gameSlug: string]: CardIndexConfig } = {
  riftbound: {
    name: 'riftbound-cards',
    keys: {
      set: 'setCode',
      collectorNumber: 'collectorNumber',
    }
  },
  mtg: {
    name: 'mtg-cards',
    keys: {
      set: 'set',
      collectorNumber: 'collector_number',
    },
  },
  drakerion: {
    name: 'drakerion-cards',
    keys: {
      set: 'setCode',
      collectorNumber: 'collectorNumber',
    },
  },
  swu: {
    name: 'swu-cards',
    keys: {
      set: 'setCode',
      collectorNumber: 'collectorNumber',
    },
  },
  fab: {
    name: 'fab-cards',
    keys: {
      set: 'setCode',
      collectorNumber: 'collectorNumber',
    },
  },
  altered: {
    name: 'altered-cards',
    keys: {
      set: 'setCode',
      collectorNumber: 'collectorNumber',
    },
  }
};

/**
 * Index de recherche d'un jeu, ou `undefined` s'il n'en a pas.
 *
 * Le passage par `Object.hasOwn` n'est pas décoratif : `indexes[slug]` remonte
 * la chaîne de prototypes, et un jeu dont le slug est `constructor`,
 * `toString` ou `valueOf` — des mots que n'importe quelle validation de slug
 * accepte — obtiendrait une configuration bidon au lieu de rien. Les documents
 * partiraient alors en silence dans un index nommé « Object », leur code
 * d'extension rangé sous une clé « undefined ».
 */
export function cardIndexFor(gameSlug?: string): CardIndexConfig | undefined {
  if (!gameSlug || !Object.hasOwn(indexes, gameSlug)) {
    return undefined;
  }
  return indexes[gameSlug];
}

/** Les cartes de ce jeu sont-elles indexées pour la recherche ? */
export function hasCardIndex(gameSlug?: string): boolean {
  return cardIndexFor(gameSlug) !== undefined;
}

/**
 * Réglages d'index nécessaires aux filtres et au tri de l'exploration des
 * cartes.
 *
 * Meilisearch refuse de filtrer ou de trier sur un attribut qui n'a pas été
 * déclaré : sans ces réglages, les plages d'énergie ou le tri par puissance
 * échouent, quels que soient les documents indexés. Ils sont donc appliqués en
 * même temps que la réindexation, depuis l'administration des cartes.
 *
 * `facetKeys` vient des attributs réellement portés par le jeu ; `numericKeys`
 * en est le sous-ensemble triable.
 */
export function cardIndexSettings(
  indexConfig: CardIndexConfig,
  { facetKeys, numericKeys }: { facetKeys: string[]; numericKeys: string[] }
): { filterableAttributes: string[]; sortableAttributes: string[] } {
  const core = [indexConfig.keys.set, indexConfig.keys.collectorNumber, "lang", "type"];

  return {
    filterableAttributes: [...new Set([...core, ...facetKeys])],
    sortableAttributes: [...new Set(["name", indexConfig.keys.collectorNumber, ...numericKeys])],
  };
}

/**
 * Codes que renvoie Meilisearch quand l'expression de filtre ou le tri portent
 * sur un attribut qui n'a pas été déclaré sur l'index.
 *
 * @see https://www.meilisearch.com/docs/reference/errors/error_codes
 */
const UNDECLARED_CRITERIA_CODES = new Set(["invalid_search_filter", "invalid_search_sort"]);

/**
 * L'erreur dit-elle que l'index refuse les critères, ou qu'il est en panne ?
 *
 * La distinction commande le repli de l'exploration des cartes : un index dont
 * les réglages n'ont pas encore été poussés se rattrape en refaisant la
 * recherche sans les critères, alors qu'une coupure réseau, une clé refusée ou
 * un index absent doivent remonter. Traiter les seconds comme le premier
 * servirait des résultats non filtrés à la place d'une panne — silencieusement,
 * puisque la page a l'air de répondre.
 */
export function isUndeclaredCriteriaError(error: unknown): boolean {
  return error instanceof MeilisearchApiError && UNDECLARED_CRITERIA_CODES.has(error.cause?.code ?? "");
}
