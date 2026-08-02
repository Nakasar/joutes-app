import {Meilisearch} from "meilisearch";

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
