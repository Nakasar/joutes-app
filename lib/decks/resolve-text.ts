import { toDeckCardInfo, type RawCard } from "@/lib/decks/card-info";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import { routeCardToZone } from "@/lib/decks/routing";
import { applyDeckText, combineDeckCards, normalizeCardName, type DeckTextApplication, type ParsedDeckText } from "@/lib/decks/text";
import { defaultDeckZone, type DeckZone } from "@/lib/decks/zones";

/**
 * Apparie une liste lue au catalogue du jeu et la range.
 *
 * Le même chemin pour l'onglet « Texte » de l'éditeur et la fenêtre de
 * création : l'appariement se fait côté serveur (`/deck-cards`), les lignes
 * sans en-tête sont rangées par type. `context` est le deck déjà en place,
 * que le rangement doit voir — un champion choisi existant n'est pas une
 * place libre.
 *
 * Rend `null` si le catalogue ne répond pas.
 */
export async function resolveDeckText(
  gameSlug: string,
  parsed: ParsedDeckText,
  zones: DeckZone[],
  { context = {}, signal }: { context?: DeckCards; signal?: AbortSignal } = {}
): Promise<{ applied: DeckTextApplication; catalog: DeckCardInfo[] } | null> {
  const names = [...new Set(parsed.lines.map((line) => line.name))];
  const response = await fetch(`/api/games/${gameSlug}/deck-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
    signal,
  });
  if (!response.ok) return null;

  const data: { matches?: Record<string, RawCard> } = await response.json();
  const byName = new Map<string, DeckCardInfo>();
  for (const [name, raw] of Object.entries(data.matches ?? {})) {
    byName.set(normalizeCardName(name), toDeckCardInfo(raw));
  }
  const byId = new Map([...byName.values()].map((card) => [card.id, card]));

  const applied = applyDeckText(
    parsed,
    (name) => byName.get(normalizeCardName(name))?.id,
    (cardId, built) => {
      const card = byId.get(cardId);
      return card ? routeCardToZone(card, zones, combineDeckCards(context, built)) : defaultDeckZone(zones);
    }
  );

  return { applied, catalog: [...byName.values()] };
}
