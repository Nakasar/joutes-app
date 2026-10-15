import type {DeckViewList} from "@/components/decks/DeckCheckView.tsx";

/** URI de la vue du vérificateur de deck, déclarée par l'outil `check_deck`. */
export const DECK_CHECK_VIEW_URI = "ui://joutes/deck-check.html";

/**
 * Ce que l'outil `check_deck` renvoie en `structuredContent` : le deck vérifié,
 * tel que la page du vérificateur l'affiche, et de quoi le rouvrir sur Joutes.
 * La vue (./main.tsx) le reçoit du client, qui le lui transmet après l'appel.
 */
export type DeckCheckResult = {
  deck: DeckViewList;
  /**
   * Code du deck, à recoller dans le vérificateur ou un autre outil. Absent
   * quand une carte n'est pas reconnue : un code ne s'écrit qu'avec des cartes
   * connues.
   */
  code?: string;
  /** Le même deck sur la page du vérificateur de Joutes. */
  url: string;
};
