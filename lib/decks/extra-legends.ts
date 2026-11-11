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

/** Cette carte est-elle Neeko, Blending In ? */
export function isExtraLegendsCard(cardId: string | undefined): boolean {
  return cardId !== undefined && EXTRA_LEGENDS_CARD.test(cardId.trim());
}

/** Le deck contient-il Neeko, dans son deck principal ou comme champion choisi ? */
export function wantsExtraLegends(cards: DeckCards | undefined): boolean {
  return [...(cards?.champions ?? []), ...(cards?.maindeck ?? [])].some(
    (entry) => entry.quantity > 0 && isExtraLegendsCard(entry.cardId)
  );
}

/**
 * Les zones du jeu, ajustées au contenu du deck : avec Neeko, la zone
 * « Légende » attend trois légendes de plus.
 */
export function zonesForDeck(zones: DeckZone[], cards: DeckCards | undefined): DeckZone[] {
  return wantsExtraLegends(cards) ? withExtraLegends(zones) : zones;
}

/**
 * Ce qui rapproche une légende de son champion au catalogue : le nom avant la
 * virgule (« Volibear, Relentless Storm » et « Volibear, Furious »).
 */
export function championKey(name: string | undefined): string | undefined {
  const key = name?.split(",")[0].trim().toLowerCase();
  return key ? key : undefined;
}

/**
 * Avec plusieurs légendes, laquelle est celle de départ ? Celle du champion
 * choisi : c'est la règle du jeu, et elle ne dépend pas de l'ordre dans lequel
 * un import ou une suite d'ajouts a rangé les cartes. `keysOf` rend ce qui lie
 * une carte à un champion (son nom au catalogue, ses tags dans le moteur).
 *
 * La première légende reste en tête si elle convient déjà, ou si aucune ne
 * correspond au champion.
 */
export function startingLegendIndex(
  legends: readonly string[],
  champion: string | undefined,
  keysOf: (card: string) => readonly (string | undefined)[] | undefined
): number {
  if (legends.length < 2 || champion === undefined) return 0;
  const wanted = new Set((keysOf(champion) ?? []).filter((key): key is string => Boolean(key)));
  if (wanted.size === 0) return 0;
  const index = legends.findIndex((legend) => (keysOf(legend) ?? []).some((key) => key !== undefined && wanted.has(key)));
  return Math.max(index, 0);
}

/** Le même contenu, la légende de départ rangée en tête de sa zone. */
export function startingLegendFirst(
  cards: DeckCards,
  keysOf: (cardId: string) => readonly (string | undefined)[] | undefined
): DeckCards {
  const legends = cards.legend ?? [];
  const index = startingLegendIndex(
    legends.map((entry) => entry.cardId),
    cards.champions?.[0]?.cardId,
    keysOf
  );
  if (index === 0) return cards;
  return { ...cards, legend: [legends[index], ...legends.slice(0, index), ...legends.slice(index + 1)] };
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
