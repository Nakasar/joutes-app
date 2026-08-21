import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Ce qui identifie la carte de catalogue derrière un exemplaire enregistré.
 * `cardId` quand l'exemplaire l'a gardé, l'impression sinon — les entrées les
 * plus anciennes n'ont que l'extension et le numéro. Le jeu borne les deux :
 * ni `cards.id` ni le couple extension/numéro ne sont uniques d'un jeu à
 * l'autre.
 */
export type CardIdentity = {
  gameId?: string;
  cardId?: string;
  setCode?: string;
  collectorNumber?: string | number;
};

export type LandscapeCards = {
  /** Cet exemplaire est-il celui d'une carte imprimée dans le sens de la largeur ? */
  has(entry: CardIdentity): boolean;
};

const NONE: LandscapeCards = { has: () => false };

const printKey = (entry: CardIdentity) =>
  `${entry.gameId ?? ""}|${entry.setCode ?? ""}#${entry.collectorNumber ?? ""}`;

const idKey = (entry: CardIdentity) => `${entry.gameId ?? ""}|${entry.cardId ?? ""}`;

/**
 * Repère, parmi des exemplaires enregistrés, ceux dont la carte est imprimée
 * dans le sens de la largeur.
 *
 * Le sens d'impression n'est pas recopié sur l'exemplaire au moment où il est
 * créé : il appartient à la carte, pas à la copie qu'on en possède. Le recopier
 * laisserait sans rien les exemplaires enregistrés avant l'arrivée du champ —
 * c'est-à-dire tous — et figerait une valeur que le catalogue peut corriger. Il
 * est donc relu à l'affichage : une requête par lot, qui ne remonte que les
 * cartes paysage, une poignée dans un catalogue.
 */
export async function findLandscapeCards(entries: CardIdentity[]): Promise<LandscapeCards> {
  const byGame = new Map<string, { ids: Set<string>; prints: Map<string, CardIdentity> }>();

  for (const entry of entries) {
    const gameId = entry.gameId ?? "";
    const group = byGame.get(gameId) ?? { ids: new Set<string>(), prints: new Map<string, CardIdentity>() };
    if (entry.cardId) {
      group.ids.add(entry.cardId);
    } else if (entry.setCode && entry.collectorNumber !== undefined && entry.collectorNumber !== "") {
      group.prints.set(printKey(entry), entry);
    }
    byGame.set(gameId, group);
  }

  const or: Record<string, unknown>[] = [];
  for (const [gameId, group] of byGame) {
    // Un identifiant de jeu illisible ne borne rien : mieux vaut chercher sans
    // lui que de laisser Mongo refuser tout le lot.
    const scope = gameId && ObjectId.isValid(gameId) ? { gameId: new ObjectId(gameId) } : {};
    if (group.ids.size > 0) {
      or.push({ ...scope, id: { $in: [...group.ids] } });
    }
    for (const print of group.prints.values()) {
      or.push({ ...scope, setCode: print.setCode, collectorNumber: print.collectorNumber });
    }
  }

  if (or.length === 0) {
    return NONE;
  }

  const docs = await db
    .collection("cards")
    .find(
      { orientation: "landscape", $or: or },
      { projection: { _id: 0, id: 1, gameId: 1, setCode: 1, collectorNumber: 1 } }
    )
    .toArray();

  if (docs.length === 0) {
    return NONE;
  }

  const ids = new Set<string>();
  const prints = new Set<string>();
  for (const doc of docs) {
    const identity: CardIdentity = {
      gameId: doc.gameId instanceof ObjectId ? doc.gameId.toString() : undefined,
      cardId: typeof doc.id === "string" ? doc.id : undefined,
      setCode: typeof doc.setCode === "string" ? doc.setCode : undefined,
      collectorNumber: doc.collectorNumber as string | number | undefined,
    };
    if (identity.cardId) {
      ids.add(idKey(identity));
      // Le jeu n'est pas toujours connu de l'appelant : la même carte est donc
      // aussi retenue sans lui, faute de quoi un exemplaire sans `gameId` ne
      // retrouverait jamais la sienne.
      ids.add(idKey({ ...identity, gameId: undefined }));
    }
    prints.add(printKey(identity));
    prints.add(printKey({ ...identity, gameId: undefined }));
  }

  return {
    // L'identifiant d'abord, l'impression ensuite : un exemplaire dont le
    // `cardId` ne mène plus à rien reste rattrapé par son extension et son
    // numéro, comme partout ailleurs.
    has: (entry) => (entry.cardId ? ids.has(idKey(entry)) : false) || prints.has(printKey(entry)),
  };
}

/**
 * Recopie le sens d'impression sur les exemplaires concernés. Les autres sont
 * rendus tels quels : l'absence du champ vaut `portrait`.
 */
export async function withCardOrientation<T extends CardIdentity>(entries: T[]): Promise<T[]> {
  if (entries.length === 0) {
    return entries;
  }

  const landscape = await findLandscapeCards(entries);
  return entries.map((entry) =>
    landscape.has(entry) ? { ...entry, orientation: "landscape" as const } : entry
  );
}
