import {Meilisearch} from "meilisearch";

const meilisearch = new Meilisearch({
  host: process.env.MEILISEARCH_ENDPOINT ?? 'localhost:7700',
  apiKey: process.env.MEILISEARCH_API_KEY ?? undefined,
});

export default meilisearch;

export const indexes: { [gameSlug: string]: { name: string; keys: { set: string; collectorNumber: string } } } = {
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
