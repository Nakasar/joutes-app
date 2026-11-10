import type { Deck } from "@/lib/types/Deck";

/**
 * Qui peut lire un deck.
 *
 * - Un deck public ou non répertorié s'ouvre à qui en a le lien.
 * - Un deck privé s'ouvre à son auteur, et aux membres d'un groupe où
 *   l'auteur l'a partagé (`playGroupDecks`). Il reste fermé à tous les autres.
 *
 * La règle est pure : savoir si le deck est partagé au lecteur demande la
 * base, et c'est `readDeckAccess` (`lib/decks/read-access.ts`) qui le lit,
 * seulement quand la réponse en dépend.
 */
export function canReadDeck(
  deck: Pick<Deck, "visibility" | "playerId">,
  userId: string | null | undefined,
  sharedWithViewer: boolean,
): boolean {
  if (deck.visibility !== "private") {
    return true;
  }
  if (userId && deck.playerId === userId) {
    return true;
  }

  return Boolean(userId) && sharedWithViewer;
}

/** Faut-il lire les partages en base pour trancher ? Seulement pour le deck privé d'un autre. */
export function needsShareLookup(deck: Pick<Deck, "visibility" | "playerId">, userId: string | null | undefined): boolean {
  return deck.visibility === "private" && Boolean(userId) && deck.playerId !== userId;
}
