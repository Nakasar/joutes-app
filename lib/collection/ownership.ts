/**
 * Exemplaires déjà possédés d'une carte, tels qu'on les affiche pendant le
 * remplissage d'un booster.
 *
 * Deux niveaux comptent pour celui qui ouvre : l'impression exacte (extension +
 * numéro de collection) et la carte au sens large — toutes variantes
 * confondues, c'est-à-dire toutes les impressions du catalogue du jeu qui
 * portent le même nom. C'est ce second niveau qui décide de la « première »
 * carte : une alt art d'une carte déjà possédée n'est pas une première.
 */

/** Possession d'un nom de carte : le total, et le détail par impression. */
export type NameOwnership = {
  /** Exemplaires possédés, toutes impressions de ce nom confondues. */
  total: number;
  /** Exemplaires possédés par impression, clé `printingKey`. */
  printings: Record<string, number>;
};

/** Possession de l'ouvreur, par nom de carte, pour un jeu donné. */
export type OwnershipSnapshot = Record<string, NameOwnership>;

export type CardPrinting = {
  name: string;
  setCode: string;
  collectorNumber: string;
};

export function printingKey(card: Pick<CardPrinting, "setCode" | "collectorNumber">): string {
  return `${card.setCode}|${card.collectorNumber}`;
}

/**
 * Deux impressions homonymes d'extensions différentes restent distinctes. La
 * clé est sérialisée plutôt que concaténée : un nom de carte contenant le
 * séparateur confondrait sinon deux impressions.
 */
function cardKey(card: CardPrinting): string {
  return JSON.stringify([card.name, card.setCode, card.collectorNumber]);
}

export type OwnedCopies = {
  /** Exemplaires possédés de cette impression précise. */
  copies: number;
  /** Exemplaires possédés toutes variantes confondues. */
  variantCopies: number;
};

export function ownedCopies(snapshot: OwnershipSnapshot, card: CardPrinting): OwnedCopies {
  const entry = snapshot[card.name];
  return {
    copies: entry?.printings[printingKey(card)] ?? 0,
    variantCopies: entry?.total ?? 0,
  };
}

/**
 * Snapshot enrichi des cartes données. Les cartes d'un booster en cours de
 * saisie ne sont pas encore versées à la collection : elles comptent malgré
 * tout comme possédées, l'ouvreur les a physiquement en main.
 */
export function addCards(snapshot: OwnershipSnapshot, cards: CardPrinting[]): OwnershipSnapshot {
  const merged: OwnershipSnapshot = {};
  for (const [name, entry] of Object.entries(snapshot)) {
    merged[name] = { total: entry.total, printings: { ...entry.printings } };
  }

  for (const card of cards) {
    const entry = (merged[card.name] ??= { total: 0, printings: {} });
    const key = printingKey(card);
    entry.total += 1;
    entry.printings[key] = (entry.printings[key] ?? 0) + 1;
  }

  return merged;
}

export type BoosterCardCopies = OwnedCopies & {
  /** Premier exemplaire possédé de cette carte, toutes variantes confondues. */
  first: boolean;
};

/**
 * Compte, pour chaque carte du booster, les exemplaires possédés en incluant
 * les cartes qui la précèdent dans le booster. Deux exemplaires d'une même
 * carte ouverts dans le même booster sont ainsi numérotés 1 puis 2, et un seul
 * porte la mention « première ».
 *
 * `outside` ne doit compter que la possession **hors** de ce booster, sans quoi
 * son contenu serait compté deux fois.
 */
export function annotateBoosterCards<T extends CardPrinting & { id: string }>(
  outside: OwnershipSnapshot,
  cards: T[]
): Record<string, BoosterCardCopies> {
  const seenByName = new Map<string, number>();
  const seenByPrinting = new Map<string, number>();
  const annotations: Record<string, BoosterCardCopies> = {};

  for (const card of cards) {
    const nameSeen = (seenByName.get(card.name) ?? 0) + 1;
    seenByName.set(card.name, nameSeen);
    const key = cardKey(card);
    const printingSeen = (seenByPrinting.get(key) ?? 0) + 1;
    seenByPrinting.set(key, printingSeen);

    const owned = ownedCopies(outside, card);
    const variantCopies = owned.variantCopies + nameSeen;
    annotations[card.id] = {
      copies: owned.copies + printingSeen,
      variantCopies,
      first: variantCopies === 1,
    };
  }

  return annotations;
}
