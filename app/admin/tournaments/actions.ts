"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/middleware/admin";
import * as gamesDb from "@/lib/db/games";
import {
  gameIdSchema,
  gameTournamentDefaultsSchema,
  type GameTournamentDefaultsInput,
} from "@/lib/schemas/game.schema";

/**
 * Enregistre les réglages de tournoi par défaut d'un jeu.
 *
 * Le formulaire envoie la configuration entière : elle remplace la précédente.
 * Un champ absent n'y veut pas dire « inchangé » mais « laissé au preset livré
 * avec le jeu » — c'est le sens que lui donne `resolveGameTournamentDefaults`,
 * et le seul qui permette de rendre un réglage au jeu en vidant une case.
 */
export async function updateGameTournamentDefaults(
  id: string,
  defaults: GameTournamentDefaultsInput
) {
  try {
    await requireAdmin();

    const validatedId = gameIdSchema.parse(id);
    const validated = gameTournamentDefaultsSchema.parse(defaults);

    const game = await gamesDb.getGameById(validatedId);
    if (!game) {
      return { success: false, error: "Jeu non trouvé" };
    }

    // `updateGame` rend `false` quand rien n'a changé dans le document, ce qui
    // arrive en réenregistrant les mêmes valeurs : le jeu existe (on vient de
    // le lire), l'écriture est donc un succès sans modification.
    await gamesDb.updateGame(validatedId, { tournamentDefaults: validated });

    revalidatePath("/admin/tournaments");
    revalidatePath(`/admin/tournaments/${validatedId}`);
    // Le tunnel de création lit ces réglages pour pré-remplir ses phases.
    revalidatePath("/tournaments/new");

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Données invalides" };
    }
    console.error("Erreur lors de la mise à jour des réglages de tournoi:", error);
    return { success: false, error: "Erreur lors de la mise à jour des réglages de tournoi" };
  }
}
