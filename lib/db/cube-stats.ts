import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { CARD_ATTRIBUTE_KEYS } from "@/lib/types/card";
import { CUBE_CARDS_COLLECTION, CUBE_PACKS_COLLECTION } from "@/lib/db/cubes";
import {
  attributeValues,
  attributesFor,
  printKey,
  resolveCubeCardAttributes,
  type CardIdentity,
} from "@/lib/db/cube-card-attributes";

export type CubeValueCount = {
  value: string;
  cards: number;
};

export type CubeAttributeDistribution = {
  /** Clé d'attribut telle que stockée sur les cartes (`rarity`, `domain`, `might`…). */
  key: string;
  /** Valeurs numériques : elles se lisent dans l'ordre croissant, pas par fréquence. */
  numeric: boolean;
  /** Attribut à valeurs multiples : une carte peut compter dans plusieurs valeurs. */
  multiValued: boolean;
  values: CubeValueCount[];
  cardsWithValue: number;
  cardsWithoutValue: number;
};

export type CubeStats = {
  packs: number;
  cards: number;
  /** Cartes distinctes : un cube peut contenir plusieurs exemplaires d'une carte. */
  distinctCards: number;
  cardsPerPack: number;
  /** Cartes retrouvées dans la base du jeu : dénominateur des distributions. */
  knownCards: number;
  /** Cartes introuvables (carte supprimée, saisie hors base) : exclues des distributions. */
  unknownCards: number;
  rarity: CubeAttributeDistribution | null;
  attributes: CubeAttributeDistribution[];
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function getCubeStats(cubeId: string, gameId: string): Promise<CubeStats> {
  const _id = new ObjectId(cubeId);

  const [packs, entries] = await Promise.all([
    db.collection(CUBE_PACKS_COLLECTION).countDocuments({ cubeId: _id }),
    db.collection(CUBE_CARDS_COLLECTION)
      .find({ cubeId: _id }, { projection: { _id: 0, cardId: 1, setCode: 1, collectorNumber: 1 } })
      .toArray() as Promise<CardIdentity[]>,
  ]);

  const resolved = await resolveCubeCardAttributes(new ObjectId(gameId), entries);

  // Une entrée par valeur d'attribut, plus le nombre de cartes qui ne portent
  // pas l'attribut du tout : la part affichée se lit alors sur un dénominateur
  // explicite plutôt que sur le total du cube.
  const counters = new Map<string, Map<string, number>>();
  const withValue = new Map<string, number>();
  const numericKeys = new Set<string>();
  const multiValuedKeys = new Set<string>();

  let knownCards = 0;
  for (const entry of entries) {
    const attributes = attributesFor(resolved, entry);
    if (!attributes) {
      continue;
    }
    knownCards += 1;

    for (const key of CARD_ATTRIBUTE_KEYS) {
      const { values, numeric, multiValued } = attributeValues(attributes[key]);
      if (values.length === 0) {
        continue;
      }
      if (numeric) {
        numericKeys.add(key);
      }
      if (multiValued) {
        multiValuedKeys.add(key);
      }

      withValue.set(key, (withValue.get(key) ?? 0) + 1);
      let counts = counters.get(key);
      if (!counts) {
        counts = new Map<string, number>();
        counters.set(key, counts);
      }
      for (const value of new Set(values)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
  }

  const distributions: CubeAttributeDistribution[] = [];
  for (const key of CARD_ATTRIBUTE_KEYS) {
    const counts = counters.get(key);
    if (!counts || counts.size === 0) {
      continue;
    }

    const numeric = numericKeys.has(key);
    const values = [...counts.entries()].map(([value, cards]) => ({ value, cards }));
    values.sort((a, b) => (numeric
      ? Number(a.value) - Number(b.value)
      : b.cards - a.cards || collator.compare(a.value, b.value)));

    const cardsWithValue = withValue.get(key) ?? 0;
    distributions.push({
      key,
      numeric,
      multiValued: multiValuedKeys.has(key),
      values,
      cardsWithValue,
      cardsWithoutValue: knownCards - cardsWithValue,
    });
  }

  const rarity = distributions.find((distribution) => distribution.key === 'rarity') ?? null;

  return {
    packs,
    cards: entries.length,
    distinctCards: new Set(entries.map((entry) => entry.cardId ?? printKey(entry.setCode, entry.collectorNumber))).size,
    cardsPerPack: packs > 0 ? entries.length / packs : 0,
    knownCards,
    unknownCards: entries.length - knownCards,
    rarity,
    attributes: distributions.filter((distribution) => distribution.key !== 'rarity'),
  };
}
