import type { DeckCards } from "@/lib/decks/contents";
import { deckZoneRule, type DeckZone } from "@/lib/decks/zones";

/**
 * Neeko, Blending In (Riftbound, RAD-167) : « If Neeko is in your deck, choose
 * 3 different legends in addition to your starting legend. »
 *
 * Le deck range alors quatre légendes dans sa zone « Légende » : la première
 * est la légende de départ — celle qui fixe les domaines —, les trois
 * suivantes sont celles de Neeko. C'est la seule carte qui touche aux bornes
 * d'une zone ; on la reconnaît à son numéro, variantes d'illustration
 * comprises (`RAD167a`).
 */
const EXTRA_LEGENDS_CARD = /^RAD-?0*167[a-z*]*$/i;
export const EXTRA_LEGENDS = 3;

/** Le deck contient-il Neeko, dans son deck principal ou comme champion choisi ? */
export function wantsExtraLegends(cards: DeckCards | undefined): boolean {
  return [...(cards?.champions ?? []), ...(cards?.maindeck ?? [])].some(
    (entry) => entry.quantity > 0 && EXTRA_LEGENDS_CARD.test(entry.cardId.trim())
  );
}

/**
 * Les zones du jeu, ajustées au contenu du deck : avec Neeko, la zone
 * « Légende » attend trois légendes de plus.
 */
export function zonesForDeck(zones: DeckZone[], cards: DeckCards | undefined): DeckZone[] {
  return wantsExtraLegends(cards) ? withExtraLegends(zones) : zones;
}

/** Les mêmes zones, avec trois légendes de plus dans la zone « Légende ». */
export function withExtraLegends(zones: DeckZone[]): DeckZone[] {
  return zones.map((zone) => {
    if (zone.key !== "legend" || zone.max === undefined) return zone;
    const bounds = {
      ...zone,
      min: (zone.min ?? 0) + EXTRA_LEGENDS,
      max: zone.max + EXTRA_LEGENDS,
    };
    return { ...bounds, rule: `${deckZoneRule(bounds)} : la légende de départ, puis les ${EXTRA_LEGENDS} de Neeko` };
  });
}
