import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { CARD_ATTRIBUTE_KEYS, CardAttributes } from "@/lib/types/card";

export type CardIdentity = {
  cardId?: string;
  setCode?: string;
  collectorNumber?: string;
};

export const printKey = (setCode?: string, collectorNumber?: string) => `${setCode ?? ''}#${collectorNumber ?? ''}`;

const ATTRIBUTES_PROJECTION: Record<string, 0 | 1> = {
  _id: 0,
  id: 1,
  setCode: 1,
  collectorNumber: 1,
  ...Object.fromEntries(CARD_ATTRIBUTE_KEYS.map((key) => [key, 1])),
};

export type ResolvedAttributes = {
  byId: Map<string, CardAttributes>;
  byPrint: Map<string, CardAttributes>;
};

/**
 * Attributs des cartes d'un cube, relus depuis `cards`. Les entrées ne stockent
 * que l'identité d'une carte : la correspondance se fait par `cardId`, sinon
 * par impression (extension + numéro) pour les cartes saisies sans identifiant.
 *
 * Partagé par les statistiques et le tirage : les deux ont besoin des mêmes
 * propriétés de jeu et doivent les retrouver de la même façon.
 */
export async function resolveCubeCardAttributes(
  gameId: ObjectId,
  identities: CardIdentity[],
): Promise<ResolvedAttributes> {
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

export function attributesFor(resolved: ResolvedAttributes, entry: CardIdentity): CardAttributes | undefined {
  return (entry.cardId ? resolved.byId.get(entry.cardId) : undefined)
    ?? resolved.byPrint.get(printKey(entry.setCode, entry.collectorNumber));
}

/** Valeurs d'un attribut pour une carte : une liste en donne plusieurs, un scalaire une seule. */
export function attributeValues(value: unknown): { values: string[]; numeric: boolean; multiValued: boolean } {
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

/** Une carte satisfait une règle si l'attribut demandé porte la valeur, seul ou dans une liste. */
export function matchesAttribute(attributes: CardAttributes | undefined, key: string, value: string): boolean {
  if (!attributes) {
    return false;
  }

  return attributeValues((attributes as Record<string, unknown>)[key]).values.includes(value);
}
