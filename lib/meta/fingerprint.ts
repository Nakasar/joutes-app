import { createHash } from "node:crypto";

import { DECK_ZONE_KEYS } from "@/lib/decks/zones";
import { normalizeCardName } from "@/lib/decks/text";
import type { DeckCards } from "@/lib/decks/contents";

/**
 * Empreinte du contenu d'un deck, pour reconnaître deux fois la même liste.
 *
 * Elle porte sur les **noms** des cartes, pas sur leurs identifiants : la même
 * liste lue depuis un lien Piltover Archive (des noms) et depuis un code (des
 * identifiants d'impression, variantes comprises) doit donner la même
 * empreinte. L'ordre des cartes et des zones ne compte pas, la zone oui.
 */
export function deckFingerprint(cards: DeckCards, nameOf: (cardId: string) => string | undefined): string {
  const parts: string[] = [];

  for (const zone of DECK_ZONE_KEYS) {
    const byName = new Map<string, number>();
    for (const entry of cards[zone] ?? []) {
      if (entry.quantity <= 0) continue;
      const name = normalizeCardName(nameOf(entry.cardId) ?? entry.cardId);
      byName.set(name, (byName.get(name) ?? 0) + entry.quantity);
    }
    if (byName.size === 0) continue;

    const sorted = [...byName.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    parts.push(`${zone}:${sorted.map(([name, quantity]) => `${quantity}x${name}`).join("|")}`);
  }

  return createHash("sha1").update(parts.join("\n")).digest("hex");
}

/**
 * Clé de rapprochement plus lâche que `normalizeCardName` : sans ponctuation
 * ni espaces. « Kings Edict » et « King's Edict » s'y rejoignent.
 */
export function looseCardKey(name: string): string {
  return normalizeCardName(name).replace(/[^\p{L}\p{N}]+/gu, "");
}
