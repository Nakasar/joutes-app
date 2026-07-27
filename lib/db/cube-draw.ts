import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { CARD_ATTRIBUTE_KEYS } from "@/lib/types/card";
import type { CubeDrawConfig } from "@/lib/types/Cube";
import { CUBE_CARDS_COLLECTION, CUBE_PACKS_COLLECTION } from "@/lib/db/cubes";
import {
  attributeValues,
  attributesFor,
  matchesAttribute,
  resolveCubeCardAttributes,
  type CardIdentity,
  type ResolvedAttributes,
} from "@/lib/db/cube-card-attributes";

export type CubeAttributeOption = {
  key: string;
  /** Valeurs effectivement portées par les cartes du cube, triées pour la saisie. */
  values: string[];
};

export type CubeDrawnCard = {
  id: string;
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

export type CubeDrawnPack = {
  id: string;
  name?: string;
  type?: string;
  /** Rang du paquet dans le cube, pour retrouver le libellé de repli « Paquet N ». */
  index: number;
  cards: CubeDrawnCard[];
};

export type CubeDrawnPlayer = {
  player: number;
  packs: CubeDrawnPack[];
  cards: CubeDrawnCard[];
};

/** Ce que le cube n'a pas pu fournir : le tirage reste rendu, amputé et annoncé. */
export type CubeDrawShortfall = {
  reason: "packs" | "cards" | "rule";
  attribute?: string;
  value?: string;
  requested: number;
  provided: number;
};

export type CubeDrawResult = {
  config: CubeDrawConfig;
  players: CubeDrawnPlayer[];
  shortfalls: CubeDrawShortfall[];
};

type CardEntry = CubeDrawnCard & { packId: string };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Attributs et valeurs présents dans le cube, pour ne proposer à la
 * configuration que des règles qui peuvent trouver des cartes.
 */
export async function getCubeAttributeOptions(cubeId: string, gameId: string): Promise<CubeAttributeOption[]> {
  const entries = await db
    .collection(CUBE_CARDS_COLLECTION)
    .find({ cubeId: new ObjectId(cubeId) }, { projection: { _id: 0, cardId: 1, setCode: 1, collectorNumber: 1 } })
    .toArray() as CardIdentity[];

  const resolved = await resolveCubeCardAttributes(new ObjectId(gameId), entries);

  const byKey = new Map<string, Set<string>>();
  for (const entry of entries) {
    const attributes = attributesFor(resolved, entry);
    if (!attributes) {
      continue;
    }
    for (const key of CARD_ATTRIBUTE_KEYS) {
      const { values } = attributeValues((attributes as Record<string, unknown>)[key]);
      if (values.length === 0) {
        continue;
      }
      const set = byKey.get(key) ?? new Set<string>();
      values.forEach((value) => set.add(value));
      byKey.set(key, set);
    }
  }

  return CARD_ATTRIBUTE_KEYS
    .filter((key) => byKey.has(key))
    .map((key) => ({ key, values: [...byKey.get(key)!].sort((a, b) => collator.compare(a, b)) }));
}

/**
 * Tire `count` éléments distincts du vivier fourni. Un même joueur ne reçoit
 * jamais deux fois le même exemplaire, quelle que soit la configuration : les
 * doublons éventuels se jouent entre joueurs, via le vivier passé en entrée.
 */
function pick<T>(pool: T[], count: number, consume: (item: T) => void): T[] {
  const picked: T[] = [];
  const available = [...pool];

  for (let i = 0; i < count; i += 1) {
    if (available.length === 0) {
      break;
    }
    const index = Math.floor(Math.random() * available.length);
    const [item] = available.splice(index, 1);
    picked.push(item);
    consume(item);
  }

  return picked;
}

export async function drawCube(
  cubeId: string,
  gameId: string,
  players: number,
  config: CubeDrawConfig,
): Promise<CubeDrawResult> {
  const _id = new ObjectId(cubeId);

  const [packDocs, cardDocs] = await Promise.all([
    db.collection(CUBE_PACKS_COLLECTION).find({ cubeId: _id }).sort({ createdAt: 1 }).toArray(),
    db.collection(CUBE_CARDS_COLLECTION).find({ cubeId: _id }).sort({ createdAt: 1 }).toArray(),
  ]);

  const cards: CardEntry[] = cardDocs.map((doc) => ({
    id: doc._id.toString(),
    packId: doc.packId.toString(),
    cardId: doc.cardId,
    name: doc.name,
    setCode: doc.setCode,
    collectorNumber: doc.collectorNumber,
    image: doc.image,
  }));

  const shortfalls: CubeDrawShortfall[] = [];

  if (config.mode === "packs") {
    // `packId` sert au regroupement mais ne sort pas du tirage : la carte est
    // recopiée sans lui, comme en mode aléatoire.
    const cardsByPack = new Map<string, CubeDrawnCard[]>();
    for (const card of cards) {
      const list = cardsByPack.get(card.packId) ?? [];
      list.push({
        id: card.id,
        cardId: card.cardId,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        image: card.image,
      });
      cardsByPack.set(card.packId, list);
    }

    const packs: CubeDrawnPack[] = packDocs.map((doc, index) => ({
      id: doc._id.toString(),
      name: doc.name || undefined,
      type: doc.type || undefined,
      index: index + 1,
      cards: cardsByPack.get(doc._id.toString()) ?? [],
    }));

    const consumed = new Set<string>();
    const drawnPlayers: CubeDrawnPlayer[] = [];
    for (let player = 1; player <= players; player += 1) {
      // Sans doublon, un paquet déjà distribué sort du vivier des joueurs suivants.
      const available = config.allowDuplicates ? packs : packs.filter((pack) => !consumed.has(pack.id));
      const picked = pick(available, config.packsPerPlayer, (pack) => {
        if (!config.allowDuplicates) {
          consumed.add(pack.id);
        }
      });
      drawnPlayers.push({ player, packs: picked, cards: [] });
    }

    const requested = players * config.packsPerPlayer;
    const provided = drawnPlayers.reduce((total, entry) => total + entry.packs.length, 0);
    if (provided < requested) {
      shortfalls.push({ reason: "packs", requested, provided });
    }

    return { config, players: drawnPlayers, shortfalls };
  }

  const resolved: ResolvedAttributes = await resolveCubeCardAttributes(new ObjectId(gameId), cards);

  const consumed = new Set<string>();
  const drawnPlayers: CubeDrawnPlayer[] = [];
  // Indexé par rang de règle et non par attribut : deux règles identiques
  // gardent des compteurs distincts, et leurs manques restent lisibles.
  const ruleProvided = config.rules.map(() => 0);

  for (let player = 1; player <= players; player += 1) {
    const drawn: CardEntry[] = [];
    const drawnIds = new Set<string>();

    // Une carte déjà prise par une règle ne repart pas dans la suivante ni dans
    // le complément : le vivier du joueur exclut toujours ses propres cartes.
    const available = () => cards.filter(
      (card) => !drawnIds.has(card.id) && (config.allowDuplicates || !consumed.has(card.id)),
    );

    for (const [ruleIndex, rule] of config.rules.entries()) {
      const candidates = available().filter(
        (card) => matchesAttribute(attributesFor(resolved, card), rule.attribute, rule.value),
      );
      const picked = pick(candidates, rule.count, (card) => {
        if (!config.allowDuplicates) {
          consumed.add(card.id);
        }
      });
      picked.forEach((card) => {
        drawn.push(card);
        drawnIds.add(card.id);
      });
      ruleProvided[ruleIndex] += picked.length;
    }

    const filler = Math.max(0, config.cardsPerPlayer - drawn.length);
    const picked = pick(available(), filler, (card) => {
      if (!config.allowDuplicates) {
        consumed.add(card.id);
      }
    });
    picked.forEach((card) => {
      drawn.push(card);
      drawnIds.add(card.id);
    });

    drawnPlayers.push({
      player,
      packs: [],
      // `packId` ne sert qu'au regroupement interne : il ne sort pas du tirage.
      cards: drawn.map((card) => ({
        id: card.id,
        cardId: card.cardId,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        image: card.image,
      })),
    });
  }

  config.rules.forEach((rule, index) => {
    const requested = rule.count * players;
    const provided = ruleProvided[index];
    if (provided < requested) {
      shortfalls.push({ reason: "rule", attribute: rule.attribute, value: rule.value, requested, provided });
    }
  });

  const requestedCards = players * config.cardsPerPlayer;
  const providedCards = drawnPlayers.reduce((total, entry) => total + entry.cards.length, 0);
  if (providedCards < requestedCards) {
    shortfalls.push({ reason: "cards", requested: requestedCards, provided: providedCards });
  }

  return { config, players: drawnPlayers, shortfalls };
}
