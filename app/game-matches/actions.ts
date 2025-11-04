"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createGameMatch,
  getGameMatches,
  getGameMatchesByUser,
  GetGameMatchesFilters,
  deleteGameMatch,
  removePlayerFromGameMatch,
  getGameMatchById,
} from "@/lib/db/game-matches";
import { gameMatchSchema } from "@/lib/schemas/game-match.schema";
import { GameMatch } from "@/lib/types/GameMatch";
import { getUserByUsernameAndDiscriminator, getUserById } from "@/lib/db/users";

export async function createGameMatchAction(
  data: {
    gameId: string;
    playedAt: Date;
    lairId?: string;
    players: Array<{
      userId: string;
      username: string;
      displayName?: string;
      discriminator?: string;
    }>;
  }
): Promise<{ success: boolean; error?: string; match?: GameMatch }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Résoudre les IDs des joueurs
    const resolvedPlayers = await Promise.all(
      data.players.map(async (player) => {
        // Si l'ID n'est pas fourni ou est vide, essayer de le résoudre
        if (!player.userId || player.userId === session.user.id) {
          // Si c'est le joueur courant, utiliser son ID
          if (!player.discriminator && !player.displayName) {
            return {
              userId: session.user.id,
              username: player.username,
              displayName: player.displayName,
              discriminator: player.discriminator,
            };
          }
          
          // Essayer de résoudre par username et discriminator
          if (player.displayName && player.discriminator) {
            const user = await getUserByUsernameAndDiscriminator(
              player.displayName,
              player.discriminator
            );
            if (user) {
              return {
                userId: user.id,
                username: player.username,
                displayName: player.displayName,
                discriminator: player.discriminator,
              };
            }
          }
        } else {
          // Vérifier que l'utilisateur existe
          const user = await getUserById(player.userId);
          if (user) {
            return player;
          }
        }
        
        // Si non résolu, utiliser l'ID du créateur (pour éviter les erreurs)
        return {
          ...player,
          userId: session.user.id,
        };
      })
    );

    // Valider les données
    const validationResult = gameMatchSchema.safeParse({
      ...data,
      players: resolvedPlayers,
    });
    
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Données invalides";
      return { success: false, error: errorMessage };
    }

    // Créer la partie
    const match = await createGameMatch({
      ...validationResult.data,
      createdBy: session.user.id,
      playedAt: validationResult.data.playedAt,
    });

    return { success: true, match };
  } catch (error) {
    console.error("Erreur lors de la création de la partie:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function getGameMatchesAction(
  filters?: GetGameMatchesFilters
): Promise<{ success: boolean; error?: string; matches?: GameMatch[] }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const matches = await getGameMatches(filters);

    return { success: true, matches };
  } catch (error) {
    console.error("Erreur lors de la récupération des parties:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function getUserGameMatchesAction(): Promise<{
  success: boolean;
  error?: string;
  matches?: GameMatch[];
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const matches = await getGameMatchesByUser(session.user.id);

    return { success: true, matches };
  } catch (error) {
    console.error("Erreur lors de la récupération des parties de l'utilisateur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function deleteGameMatchAction(
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de la partie
    const match = await getGameMatchById(matchId);
    
    if (!match) {
      return { success: false, error: "Partie non trouvée" };
    }

    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Vous n'êtes pas autorisé à supprimer cette partie" };
    }

    const result = await deleteGameMatch(matchId);

    if (!result) {
      return { success: false, error: "Erreur lors de la suppression de la partie" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression de la partie:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function removePlayerFromMatchAction(
  matchId: string,
  playerUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    // Récupérer la partie
    const match = await getGameMatchById(matchId);
    
    if (!match) {
      return { success: false, error: "Partie non trouvée" };
    }

    // Vérifier les permissions :
    // - L'utilisateur peut se retirer lui-même
    // - Le créateur peut retirer n'importe quel joueur
    const isCreator = match.createdBy === session.user.id;
    const isSelf = playerUserId === session.user.id;

    if (!isCreator && !isSelf) {
      return { success: false, error: "Vous n'êtes pas autorisé à retirer ce joueur" };
    }

    const result = await removePlayerFromGameMatch(matchId, playerUserId);

    if (!result) {
      return { success: false, error: "Erreur lors du retrait du joueur" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du retrait du joueur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
