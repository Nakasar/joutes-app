import "server-only";

import { revalidatePath } from "next/cache";

import { locales } from "@/i18n/config.ts";

/**
 * Ce qu'un changement de la bibliothèque rend périmé : les vues des groupes
 * touchés, dans toutes les langues, et la fiche du deck quand on la connaît.
 * Hors du fichier d'actions : tout ce qu'exporte un module `"use server"` est
 * appelable depuis le navigateur.
 */
export function revalidateGroupDecks(playGroupIds: string[], deckId?: string) {
  for (const locale of locales) {
    for (const playGroupId of playGroupIds) {
      revalidatePath(`/${locale}/play-groups/${playGroupId}`, "layout");
    }
    if (deckId) {
      revalidatePath(`/${locale}/decks/${deckId}`);
    }
  }
}
