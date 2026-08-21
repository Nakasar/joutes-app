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

/**
 * Le jeu, ramené à ce qui peut réellement borner une recherche. Un identifiant
 * qu'on ne saurait pas relire ne borne rien : il vaut alors l'absence de jeu,
 * ici comme dans la requête — les deux doivent dire la même chose, sinon on
 * chercherait large pour ensuite ne rien reconnaître.
 */
const gameScope = (gameId?: string) => (gameId && ObjectId.isValid(gameId) ? gameId : "");

const printKey = (entry: CardIdentity) =>
  `${gameScope(entry.gameId)}|${entry.setCode ?? ""}#${entry.collectorNumber ?? ""}`;

const idKey = (entry: CardIdentity) => `${gameScope(entry.gameId)}|${entry.cardId ?? ""}`;

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
    const gameId = gameScope(entry.gameId);
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
    // `gameScope` a déjà écarté ce qui n'est pas relisible : ce qui reste est
    // soit un identifiant valide, soit l'absence de jeu, qui cherche large.
    const scope = gameId ? { gameId: new ObjectId(gameId) } : {};
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
