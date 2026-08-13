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

    // Un formulaire qui ne s'écarte en rien du format livré ne produit aucun
    // réglage : le champ est alors retiré, et non posé à `{}`. Sans quoi le jeu
    // se dirait réglé sans l'être, et rien ne permettrait plus de revenir à
    // l'état d'origine.
    const hasSettings = Object.keys(validated).length > 0;
    await gamesDb.setGameTournamentDefaults(validatedId, hasSettings ? validated : null);

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
