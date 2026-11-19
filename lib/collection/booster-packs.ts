import 'server-only';

import { ObjectId } from 'bson';

import db from "@/lib/mongodb";
import { getBoosterTypeCounts, sampleBoosters, type BoosterTypeCount } from "@/lib/db/boosters";
import { getBoosterTypeLabels } from "@/lib/constants/booster-types";
import { toEngineCode } from "@/lib/engine/cards";
import { boosterSetCodes, engineCards } from "@/lib/engine/server";
import { drawPacks, type CollectionBooster, type DrawnPacks } from "@/lib/engine/limited";
import { toSwuCode } from "@/lib/engine/swu/cards";
import { swuBoosterSetCodes, swuEngineCards } from "@/lib/engine/swu/server";
import { BETA_SETS, toCpCode } from "@/lib/engine/cyberpunk/cards";
import { cpBoosterSetCodes, cpEngineCards } from "@/lib/engine/cyberpunk/server";
import type { Game } from "@/lib/types/Game";

/**
 * Piocher des boosters enregistrés dans la collection d'un joueur pour un scellé
 * ou un draft contre l'IA : les types de boosters qu'il a, puis le tirage lui-même,
 * avec les cartes ramenées aux codes du moteur.
 */

/** Le tirage : les boosters ouverts (codes moteur), leur extension affichée, et les compteurs de ce qui a été écarté. */
export type CollectionDraw = DrawnPacks & { /** Nombre total de cartes tirées. */ cards: number };

/** Par jeu : les extensions du moteur, le code moteur d'une carte, et l'extension moteur d'un `setCode` du catalogue. */
type PackEngine = {
  sets: () => string[];
  toCode: (cardId: string) => string | null;
  setOf: (setCode: string) => string | null;
};

/** L'extension moteur d'un `setCode` du catalogue : dans les extensions du moteur, ou via la table explicite (un tirage Beta), sinon `null`. */
function setOf(sets: () => string[], equivalents: Record<string, string> = {}) {
  return (setCode: string): string | null => {
    const upper = setCode.trim().toUpperCase();
    const mapped = equivalents[upper] ?? upper;
    return sets().includes(mapped) ? mapped : null;
  };
}

const ENGINES: Record<string, PackEngine> = {
  riftbound: {
    sets: boosterSetCodes,
    toCode: (cardId) => {
      const code = toEngineCode(cardId);
      return code && engineCards().has(code) ? code : null;
    },
    setOf: setOf(boosterSetCodes),
  },
  swu: {
    sets: swuBoosterSetCodes,
    toCode: (cardId) => {
      const code = toSwuCode(cardId);
      return code && swuEngineCards().has(code) ? code : null;
    },
    setOf: setOf(swuBoosterSetCodes),
  },
  cp: {
    sets: cpBoosterSetCodes,
    toCode: (cardId) => toCpCode(cardId, (code) => cpEngineCards().has(code)),
    setOf: setOf(cpBoosterSetCodes, BETA_SETS),
  },
};

/** Les types de boosters de l'utilisateur pour un jeu, avec le nombre de chacun et le détail par extension. */
export async function collectionBoosterTypes(
  userId: string,
  game: Game,
): Promise<{ types: BoosterTypeCount[]; labels: Record<string, string> }> {
  const types = await getBoosterTypeCounts({ userId, gameId: game.id });
  return { types, labels: getBoosterTypeLabels(game) };
}

const printKey = (setCode?: string, collectorNumber?: string) => `${setCode ?? ''}#${collectorNumber ?? ''}`;

/**
 * Le tirage de `count` boosters d'un type de la collection de l'utilisateur, en
 * codes du moteur. `null` quand la collection n'a aucun booster de ce type. Les
 * entrées saisies avant l'ajout de `cardId` n'ont que leur impression : c'est le
 * catalogue qui leur rend leur identifiant.
 */
export async function collectionPacks(
  userId: string,
  game: Game,
  slug: string,
  type: string,
  count: number,
): Promise<CollectionDraw | null> {
  const engine = ENGINES[game.slug ?? slug];
  if (!engine) return null;
  const sampled = await sampleBoosters({ userId, gameId: game.id, type, count });
  if (sampled.length === 0) return null;

  const prints = [
    ...new Map(
      sampled
        .flatMap((booster) => booster.cards)
        .filter((card) => !card.cardId && card.setCode && card.collectorNumber)
        .map((card) => [printKey(card.setCode, card.collectorNumber), { setCode: card.setCode, collectorNumber: card.collectorNumber }]),
    ).values(),
  ];
  const idByPrint = new Map<string, string>();
  if (prints.length > 0) {
    const docs = await db
      .collection<{ id?: string; setCode?: string; collectorNumber?: string }>('cards')
      .find({ gameId: new ObjectId(game.id), $or: prints }, { projection: { _id: 0, id: 1, setCode: 1, collectorNumber: 1 } })
      .toArray();
    for (const doc of docs) {
      if (doc.id) idByPrint.set(printKey(doc.setCode, doc.collectorNumber), doc.id);
    }
  }

  const boosters: CollectionBooster[] = sampled.map((booster) => ({
    setCode: booster.setCode,
    cards: booster.cards.flatMap((card) => {
      const cardId = card.cardId || idByPrint.get(printKey(card.setCode, card.collectorNumber));
      return cardId ? [{ cardId, ...(card.foil === true ? { foil: true } : {}) }] : [];
    }),
  }));

  const drawn = drawPacks(engine.toCode, engine.setOf, boosters, count);
  return { ...drawn, cards: drawn.packs.reduce((total, pack) => total + pack.length, 0) };
}
