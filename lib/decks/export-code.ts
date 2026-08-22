import { getCodeFromDeck, type Card } from "@piltoverarchive/riftbound-deck-codes";

import { cardIdToPiltoverFormat } from "@/app/[locale]/(app)/games/riftbound/deck-checker/utils";
import { zoneEntries, type DeckCards } from "@/lib/decks/contents";

/**
 * Code d'export d'un deck Riftbound — celui qui se colle dans le client du jeu
 * et dans le vérificateur de deck.
 *
 * Le format est propre à Riftbound : les autres jeux n'en ont pas, et le
 * dialogue de partage n'affiche alors que le lien. Le code se calcule côté
 * serveur — la bibliothèque qui l'écrit n'a rien à faire dans le paquet envoyé
 * au navigateur pour un bouton « copier ».
 *
 * Un deck incomplet ne bloque pas le partage : faute de code, on rend
 * `undefined` plutôt que de laisser l'erreur remonter jusqu'à la page.
 */
export function riftboundDeckCode(cards: DeckCards | undefined): string | undefined {
  if (!cards) {
    return undefined;
  }

  const toCards = (entries: ReturnType<typeof zoneEntries>): Card[] =>
    entries.map((entry) => ({
      cardCode: cardIdToPiltoverFormat(entry.cardId),
      count: entry.quantity,
    }));

  const main = [
    ...toCards(zoneEntries(cards, "maindeck")),
    ...toCards(zoneEntries(cards, "runes")),
    ...toCards(zoneEntries(cards, "legend")),
    ...toCards(zoneEntries(cards, "battlefields")),
  ];

  if (main.length === 0) {
    return undefined;
  }

  const champion = zoneEntries(cards, "champions")[0]?.cardId;

  try {
    return getCodeFromDeck(
      main,
      toCards(zoneEntries(cards, "sideboard")),
      champion ? cardIdToPiltoverFormat(champion) : undefined
    );
  } catch (error) {
    console.warn("Impossible de produire le code d'export du deck", error);
    return undefined;
  }
}
