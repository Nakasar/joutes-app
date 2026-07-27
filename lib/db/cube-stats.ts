import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { CARD_ATTRIBUTE_KEYS, CardAttributes } from "@/lib/types/card";
import { CUBE_CARDS_COLLECTION, CUBE_PACKS_COLLECTION } from "@/lib/db/cubes";

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

type CardIdentity = {
  cardId?: string;
  setCode?: string;
  collectorNumber?: string;
};

const printKey = (setCode?: string, collectorNumber?: string) => `${setCode ?? ''}#${collectorNumber ?? ''}`;

const ATTRIBUTES_PROJECTION: Record<string, 0 | 1> = {
  _id: 0,
  id: 1,
  setCode: 1,
  collectorNumber: 1,
  ...Object.fromEntries(CARD_ATTRIBUTE_KEYS.map((key) => [key, 1])),
};

/**
 * Attributs des cartes du cube, relus depuis `cards`. Les entrées ne stockent
 * que l'identité d'une carte : la correspondance se fait par `cardId`, sinon
 * par impression (extension + numéro) pour les cartes saisies sans identifiant.
 */
async function resolveAttributes(gameId: ObjectId, identities: CardIdentity[]): Promise<{
  byId: Map<string, CardAttributes>;
  byPrint: Map<string, CardAttributes>;
}> {
  const byId = new Map<string, CardAttributes>();
  const byPrint = new Map<string, CardAttributes>();
  if (identities.length === 0) {
    return { byId, byPrint };
  }

  const cardIds = [...new Set(identities.map((card) => card.cardId).filter((id): id is string => Boolean(id)))];
  const prints = [
    ...new Map(
      identities
        .filter((card) => !card.cardId && card.setCode && card.collectorNumber)
        .map((card) => [printKey(card.setCode, card.collectorNumber), {
          setCode: card.setCode,
          collectorNumber: card.collectorNumber,
        }]),
    ).values(),
  ];

  const or: Record<string, unknown>[] = [];
  if (cardIds.length > 0) {
    or.push({ id: { $in: cardIds } });
  }
  or.push(...prints);
  if (or.length === 0) {
    return { byId, byPrint };
  }

  const docs = await db
    .collection('cards')
    .find({ gameId, $or: or }, { projection: ATTRIBUTES_PROJECTION })
    .toArray();

  for (const doc of docs) {
    const attributes: Record<string, unknown> = {};
    for (const key of CARD_ATTRIBUTE_KEYS) {
      const value = doc[key];
      if (value !== undefined && value !== null) {
        attributes[key] = value;
      }
    }

    if (typeof doc.id === 'string' && !byId.has(doc.id)) {
      byId.set(doc.id, attributes as CardAttributes);
    }
    const key = printKey(doc.setCode, doc.collectorNumber);
    if (!byPrint.has(key)) {
      byPrint.set(key, attributes as CardAttributes);
    }
  }

  return { byId, byPrint };
}

/** Valeurs d'un attribut pour une carte : une liste en donne plusieurs, un scalaire une seule. */
function attributeValues(value: unknown): { values: string[]; numeric: boolean; multiValued: boolean } {
  if (Array.isArray(value)) {
    const values = value
      .filter((item) => item !== null && item !== undefined && item !== '')
      .map((item) => String(item));
    return { values, numeric: false, multiValued: true };
  }
  if (typeof value === 'number') {
    return { values: [String(value)], numeric: true, multiValued: false };
  }
  if (typeof value === 'string' && value.length > 0) {
    return { values: [value], numeric: false, multiValued: false };
  }
  if (typeof value === 'boolean') {
    return { values: [String(value)], numeric: false, multiValued: false };
  }
  return { values: [], numeric: false, multiValued: false };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function getCubeStats(cubeId: string, gameId: string): Promise<CubeStats> {
  const _id = new ObjectId(cubeId);

  const [packs, entries] = await Promise.all([
    db.collection(CUBE_PACKS_COLLECTION).countDocuments({ cubeId: _id }),
    db.collection(CUBE_CARDS_COLLECTION)
      .find({ cubeId: _id }, { projection: { _id: 0, cardId: 1, setCode: 1, collectorNumber: 1 } })
      .toArray() as Promise<CardIdentity[]>,
  ]);

  const { byId, byPrint } = await resolveAttributes(new ObjectId(gameId), entries);

  // Une entrée par valeur d'attribut, plus le nombre de cartes qui ne portent
  // pas l'attribut du tout : la part affichée se lit alors sur un dénominateur
  // explicite plutôt que sur le total du cube.
  const counters = new Map<string, Map<string, number>>();
  const withValue = new Map<string, number>();
  const numericKeys = new Set<string>();
  const multiValuedKeys = new Set<string>();

  let knownCards = 0;
  for (const entry of entries) {
    const attributes = (entry.cardId ? byId.get(entry.cardId) : undefined)
      ?? byPrint.get(printKey(entry.setCode, entry.collectorNumber));
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
