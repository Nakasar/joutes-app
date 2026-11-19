/**
 * Scellé de Cyberpunk TCG (Tournament Rules, annexe D.2.2) : les nombres du
 * format et les calculs que les écrans font autour d'un deck en construction.
 * Aucune règle ici : c'est le moteur qui dit si un deck est légal
 * (`CpLimitedEvent.check`).
 */

import type { CpTableCard, CpTableCards } from "@/lib/engine/cyberpunk/cards";
import type { CpColor, CpDeckList } from "@/lib/engine/cyberpunk/types";
import { leftAfter, type LimitedRules, type Pulled } from "@/lib/engine/limited";

/** Six boosters de douze cartes, un deck de trente cartes au moins. Le jeu n'a pas de draft. */
export function cpLimitedRules(): LimitedRules {
  return { boosters: 6, minMain: 30, packSize: 12, picks: 0 };
}

/** Légendes d'un deck : trois au plus, de noms différents. */
export const CP_MAX_LEGENDS = 3;
/** Couleurs du deck principal : trois au plus, sans regard pour celles des Légendes. */
export const CP_MAX_COLORS = 3;

export const CP_COLORS: CpColor[] = ["red", "green", "blue", "yellow"];

export const CP_RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Secret", "Nova Rare"];

export const CP_RARITY_COLORS: Record<string, string> = {
  Rare: "#f0b24a",
  Epic: "#c58bff",
  Secret: "#ff6b9d",
  "Nova Rare": "#ff6b9d",
};

export function emptyCpDeck(): CpDeckList {
  return { legends: [], cards: [] };
}

/** Les cartes qui entrent dans le deck principal : tout sauf les Légendes. */
export function isCpMain(card: CpTableCard | undefined): boolean {
  return card !== undefined && card.kind !== "legend";
}

/** Ce qui reste de la réserve une fois le deck servi. */
export function leftInCpPool(pool: Pulled[], deck: CpDeckList): Pulled[] {
  return leftAfter(pool, [...deck.legends, ...deck.cards]);
}

/** Le deck privé des cartes que la réserve n'a pas (une sauvegarde abîmée). */
export function fitCpToPool(deck: CpDeckList, pool: Pulled[]): CpDeckList {
  const left = new Map<string, number>();
  for (const card of pool) left.set(card.code, (left.get(card.code) ?? 0) + 1);
  const take = (code: string): boolean => {
    const count = left.get(code) ?? 0;
    if (count <= 0) return false;
    left.set(code, count - 1);
    return true;
  };
  return { legends: deck.legends.filter(take), cards: deck.cards.filter(take) };
}

/** Les couleurs du deck principal, dans l'ordre de `CP_COLORS`. */
export function cpDeckColors(deck: CpDeckList, cards: CpTableCards): CpColor[] {
  const used = new Set(deck.cards.map((code) => cards[code]?.color));
  return CP_COLORS.filter((color) => used.has(color));
}

/** Vrai si cette carte ajouterait une quatrième couleur au deck principal. */
export function isOffColor(card: CpTableCard | undefined, colors: CpColor[]): boolean {
  return card !== undefined && isCpMain(card) && colors.length >= CP_MAX_COLORS && !colors.includes(card.color);
}

/**
 * Vrai si cette Légende ne peut pas rejoindre le deck : il en a déjà trois, ou
 * une du même nom (le nom sans le sous-titre).
 */
export function isLegendTaken(card: CpTableCard | undefined, deck: CpDeckList, cards: CpTableCards): boolean {
  if (!card || card.kind !== "legend") return false;
  return deck.legends.length >= CP_MAX_LEGENDS || deck.legends.some((code) => cards[code]?.title === card.title);
}

/** La courbe des coûts du deck principal : huit colonnes, la dernière pour 7 et plus. */
export function cpCostCurve(deck: CpDeckList, cards: CpTableCards): number[] {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const code of deck.cards) {
    const card = cards[code];
    if (card) curve[Math.min(card.cost ?? 0, 7)] += 1;
  }
  return curve;
}

/** Ajoute une carte de la réserve au deck, à la place que son type lui donne. */
export function addToCpDeck(deck: CpDeckList, card: CpTableCard): CpDeckList {
  return card.kind === "legend"
    ? { ...deck, legends: [...deck.legends, card.code] }
    : { ...deck, cards: [...deck.cards, card.code] };
}

/** Retire un exemplaire d'une carte du deck, Légende ou non. */
export function removeFromCpDeck(deck: CpDeckList, code: string): CpDeckList {
  const legend = deck.legends.lastIndexOf(code);
  if (legend >= 0) return { ...deck, legends: deck.legends.filter((_, index) => index !== legend) };
  const at = deck.cards.lastIndexOf(code);
  return at < 0 ? deck : { ...deck, cards: deck.cards.filter((_, index) => index !== at) };
}
