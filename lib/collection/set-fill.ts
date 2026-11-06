import type { CatalogCard } from "@/lib/collection/formats/types";
import { normalizeCollectorNumber } from "@/lib/collection/formats/catalog";

/**
 * Ajout rapide d'une extension : N exemplaires de chacune de ses cartes.
 *
 * Ce module décide **quelles** cartes et **combien** ; l'écriture se fait dans
 * la route. Il est pur, pour que chaque règle (une carte par nom dans le set de
 * jeu, le mode « compléter », les raretés) se vérifie sans base de données.
 */

/** Ajouter N partout, ou compléter jusqu'à N ce qu'on a déjà. */
export type SetFillMode = "add" | "fill";

/**
 * Set de jeu : une version de chaque carte (un nom = une carte), sans ses
 * variantes. Set maître : chaque numéro de collection, variantes comprises.
 * Ce sont les deux complétions qu'affiche déjà la collection.
 */
export type SetFillScope = "game" | "master";

export type SetFillOptions = {
  copies: number;
  mode: SetFillMode;
  scope: SetFillScope;
  /** Raretés retenues ; absent ou vide = toutes. */
  rarities?: string[];
};

export type SetFillEntry = { card: CatalogCard; quantity: number };

export type SetFillPlan = {
  entries: SetFillEntry[];
  /** Exemplaires ajoutés au total. */
  copies: number;
  /** Cartes de l'extension retenues (après le filtre de raretés). */
  cards: number;
  /** Cartes retenues qui n'ont rien reçu : déjà au nombre demandé. */
  unchanged: number;
};

/** Exemplaires possédés, par tirage et par nom, pour le mode « compléter ». */
export type OwnedCounts = {
  byPrinting: Map<string, number>;
  byName: Map<string, number>;
};

/** Un ajout ne dépasse pas ce nombre d'exemplaires par carte. */
export const MAX_SET_FILL_COPIES = 20;

export function printingKey(setCode: string, collectorNumber: string): string {
  return `${setCode.trim().toUpperCase()}|${normalizeCollectorNumber(collectorNumber)}`;
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Ordre d'un numéro de collection : la partie numérique d'abord, puis ce qui
 * suit. `12` passe avant `12a` (la variante), et `9` avant `10`.
 */
function compareCollectorNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  // À numéro égal, le plus court est la version de base : `12` avant `12a`.
  return a.length - b.length || a.localeCompare(b);
}

/**
 * Les cartes d'une extension, une par numéro de collection. Le catalogue porte
 * une ligne par langue : sans ce regroupement, une carte importée en deux
 * langues recevrait deux fois ses exemplaires.
 */
export function setPrintings(catalog: CatalogCard[], setCode: string): CatalogCard[] {
  const wanted = setCode.trim().toUpperCase();
  const seen = new Map<string, CatalogCard>();
  for (const card of catalog) {
    if (card.setCode.trim().toUpperCase() !== wanted) continue;
    const key = printingKey(card.setCode, card.collectorNumber);
    if (!seen.has(key)) seen.set(key, card);
  }
  return [...seen.values()].sort((a, b) => compareCollectorNumbers(a.collectorNumber, b.collectorNumber));
}

/**
 * Une carte par nom : la version de base, c'est-à-dire le plus petit numéro
 * (`OGN-202` plutôt que la showcase `OGN-202a`).
 */
export function gameSetCards(printings: CardCatalogList): CatalogCard[] {
  const byName = new Map<string, CatalogCard>();
  for (const card of printings) {
    const key = nameKey(card.name);
    const current = byName.get(key);
    if (!current || compareCollectorNumbers(card.collectorNumber, current.collectorNumber) < 0) {
      byName.set(key, card);
    }
  }
  return [...byName.values()].sort((a, b) => compareCollectorNumbers(a.collectorNumber, b.collectorNumber));
}

type CardCatalogList = readonly CatalogCard[];

/** Les raretés présentes dans une liste de cartes, dans l'ordre où elles apparaissent. */
export function raritiesOf(cards: CardCatalogList): string[] {
  return [...new Set(cards.map((card) => card.rarity).filter((rarity): rarity is string => Boolean(rarity)))];
}

/**
 * Ce que l'ajout ferait. En mode « compléter », la référence est ce qu'on
 * possède déjà : pour le set de jeu, tous les tirages du même nom comptent
 * (une showcase vaut un exemplaire de la carte pour jouer) ; pour le set
 * maître, seul ce tirage précis compte.
 */
export function planSetFill(
  printings: CardCatalogList,
  options: SetFillOptions,
  owned: OwnedCounts = { byPrinting: new Map(), byName: new Map() }
): SetFillPlan {
  const copies = Math.max(0, Math.min(MAX_SET_FILL_COPIES, Math.floor(options.copies)));
  const rarities = options.rarities?.length ? new Set(options.rarities) : null;

  const base = options.scope === "game" ? gameSetCards(printings) : [...printings];
  const cards = rarities ? base.filter((card) => card.rarity !== undefined && rarities.has(card.rarity)) : base;

  const entries: SetFillEntry[] = [];
  let unchanged = 0;
  for (const card of cards) {
    const have =
      options.scope === "game"
        ? owned.byName.get(nameKey(card.name)) ?? 0
        : owned.byPrinting.get(printingKey(card.setCode, card.collectorNumber)) ?? 0;
    const quantity = options.mode === "add" ? copies : Math.max(0, copies - have);
    if (quantity > 0) entries.push({ card, quantity });
    else unchanged += 1;
  }

  return {
    entries,
    copies: entries.reduce((total, entry) => total + entry.quantity, 0),
    cards: cards.length,
    unchanged,
  };
}
