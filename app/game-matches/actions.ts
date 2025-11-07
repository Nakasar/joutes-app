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
  addPlayerToGameMatch,
} from "@/lib/db/game-matches";
import { gameMatchSchema } from "@/lib/schemas/game-match.schema";
import { GameMatch } from "@/lib/types/GameMatch";
import { getUserByUsernameAndDiscriminator, getUserById } from "@/lib/db/users";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";

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
    const resolvedPlayerIds = await Promise.all(
      data.players.map(async (player) => {
        // Si l'ID n'est pas fourni ou est vide, essayer de le résoudre
        if (!player.userId || player.userId === session.user.id) {
          // Si c'est le joueur courant, utiliser son ID
          if (!player.discriminator && !player.displayName) {
            return session.user.id;
          }
          
          // Essayer de résoudre par username et discriminator
          if (player.displayName && player.discriminator) {
            const user = await getUserByUsernameAndDiscriminator(
              player.displayName,
              player.discriminator
            );
            if (user) {
              return user.id;
            }
          }
        } else {
          // Vérifier que l'utilisateur existe
          const user = await getUserById(player.userId);
          if (user) {
            return player.userId;
          }
        }
        
        // Si non résolu, utiliser l'ID du créateur (pour éviter les erreurs)
        return session.user.id;
      })
    );

    // Valider les données
    const validationResult = gameMatchSchema.safeParse({
      gameId: data.gameId,
      playedAt: data.playedAt,
      lairId: data.lairId,
      playerIds: resolvedPlayerIds,
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

export async function addPlayerToMatchAction(
  matchId: string,
  displayName: string,
  discriminator: string
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

    // Vérifier que l'utilisateur est le créateur
    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Vous n'êtes pas autorisé à ajouter des joueurs" };
    }

    // Résoudre l'utilisateur par username et discriminator
    const user = await getUserByUsernameAndDiscriminator(displayName, discriminator);

    if (!user) {
      return { success: false, error: "Utilisateur non trouvé" };
    }

    // Ajouter le joueur
    const result = await addPlayerToGameMatch(matchId, user.id);

    if (!result) {
      return { success: false, error: "Le joueur est déjà dans la partie" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'ajout du joueur:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function updateGameMatchAction(
  matchId: string,
  data: {
    gameId?: string;
    playedAt?: Date;
    lairId?: string | null;
  }
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

    // Vérifier que l'utilisateur est le créateur
    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Vous n'êtes pas autorisé à modifier cette partie" };
    }

    // Préparer les données à mettre à jour
    const updateData: {
      gameId?: string;
      playedAt?: Date;
      lairId?: string;
    } = {};

    if (data.gameId) {
      updateData.gameId = data.gameId;
    }

    if (data.playedAt) {
      updateData.playedAt = data.playedAt;
    }

    if (data.lairId !== undefined) {
      if (data.lairId === null || data.lairId === "") {
        // Supprimer le champ lairId en utilisant $unset
        await db.collection("gameMatches").updateOne(
          { _id: new ObjectId(matchId) },
          { $unset: { lairId: "" } }
        );
      } else {
        updateData.lairId = data.lairId;
      }
    }

    // Si on a d'autres données à mettre à jour
    if (Object.keys(updateData).length > 0) {
      const { updateGameMatch } = await import("@/lib/db/game-matches");
      const result = await updateGameMatch(matchId, updateData);

      if (!result) {
        return { success: false, error: "Erreur lors de la mise à jour de la partie" };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la partie:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function rateGameMatchAction(
  matchId: string,
  rating: 1 | 2 | 3 | 4 | 5
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

    // Vérifier que l'utilisateur est un joueur de la partie
    if (!match.playerIds.includes(session.user.id)) {
      return { success: false, error: "Vous devez être joueur de la partie pour l'évaluer" };
    }

    const { rateGameMatch } = await import("@/lib/db/game-matches");
    const result = await rateGameMatch(matchId, session.user.id, rating);

    if (!result) {
      return { success: false, error: "Erreur lors de l'évaluation de la partie" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'évaluation de la partie:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function voteMVPAction(
  matchId: string,
  votedForId: string
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

    // Vérifier que l'utilisateur est un joueur de la partie
    if (!match.playerIds.includes(session.user.id)) {
      return { success: false, error: "Vous devez être joueur de la partie pour voter MVP" };
    }

    // Vérifier que le joueur voté est dans la partie
    if (!match.playerIds.includes(votedForId)) {
      return { success: false, error: "Le joueur voté doit être dans la partie" };
    }

    // Vérifier qu'on ne vote pas pour soi-même
    if (votedForId === session.user.id) {
      return { success: false, error: "Vous ne pouvez pas voter pour vous-même" };
    }

    const { voteMVP } = await import("@/lib/db/game-matches");
    const result = await voteMVP(matchId, session.user.id, votedForId);

    if (!result) {
      return { success: false, error: "Erreur lors du vote MVP" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du vote MVP:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function toggleWinnerAction(
  matchId: string,
  userId: string
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

    // Vérifier que l'utilisateur est le créateur
    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Seul le créateur peut désigner les gagnants" };
    }

    // Vérifier que le joueur est dans la partie
    if (!match.playerIds.includes(userId)) {
      return { success: false, error: "Le joueur doit être dans la partie" };
    }

    const { toggleWinner } = await import("@/lib/db/game-matches");
    const result = await toggleWinner(matchId, userId);

    if (!result) {
      return { success: false, error: "Erreur lors de la désignation du gagnant" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la désignation du gagnant:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
