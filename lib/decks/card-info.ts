import type { DeckCardInfo } from "@/lib/decks/contents";
import type { CardOrientation } from "@/lib/types/card";

/**
 * Attributs candidats au « coût » d'une carte, du plus explicite au plus
 * spécifique à un jeu.
 *
 * La courbe de coûts a besoin d'un nombre par carte, mais aucun catalogue ne
 * s'accorde sur son nom : Riftbound dit `energy`, d'autres jeux diront `cost`
 * ou `mana`. Plutôt que d'imposer un champ, on lit le premier attribut
 * numérique connu — un jeu qui n'en porte aucun n'a simplement pas de courbe.
 */
export const CARD_COST_KEYS = ["cost", "energy", "mana", "manaValue", "manaCost"] as const;

/** Ce qu'un document de carte porte, vu d'ici : le reste ne concerne pas les decks. */
export type RawCard = {
  id?: string;
  name?: string;
  image?: string;
  type?: string;
  setCode?: string;
  collectorNumber?: string;
  domain?: string[] | string;
  orientation?: CardOrientation;
  [key: string]: unknown;
};

export function cardCost(card: RawCard): number | undefined {
  for (const key of CARD_COST_KEYS) {
    const value = card[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

export function cardDomains(card: RawCard): string[] | undefined {
  if (Array.isArray(card.domain)) return card.domain;
  if (typeof card.domain === "string" && card.domain) return [card.domain];
  return undefined;
}

/**
 * Réduit un document de carte à ce dont un deck a besoin.
 *
 * La même lecture des deux côtés : la base la fait pour la fiche, la recherche
 * du catalogue la refait pour l'éditeur. Deux conversions différentes
 * donneraient une courbe de coûts qui change selon l'écran.
 */
export function toDeckCardInfo(card: RawCard): DeckCardInfo {
  return {
    id: String(card.id ?? ""),
    name: String(card.name ?? ""),
    // L'URL du catalogue porte parfois une requête de redimensionnement : la
    // vignette d'un deck la reprend telle quelle ailleurs dans le site.
    image: typeof card.image === "string" ? card.image.split("?")[0] : undefined,
    type: card.type,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    cost: cardCost(card),
    domain: cardDomains(card),
    orientation: card.orientation,
  };
}
