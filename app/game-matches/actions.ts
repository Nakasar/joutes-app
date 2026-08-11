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
  updateGameMatch,
  rateGameMatch,
  updateGameMatchBattleReport,
  setGameMatchBattleReportArmy,
  setGameMatchBattleMap,
} from "@/lib/db/game-matches";
import {
  battleMapSchema,
  battleReportArmySchema,
  battleReportSchema,
  gameMatchSchema,
} from "@/lib/schemas/game-match.schema";
import { GameMatch } from "@/lib/types/GameMatch";
import { BattleMap, BattleReport, BattleReportArmy } from "@/lib/types/Match";
import { normalizeArmy, normalizeBattleReport } from "@/lib/battle-reports/army";
import { normalizeBattleMap } from "@/lib/battle-reports/battle-map";
import { searchGameProducts, type GameProductSummary } from "@/lib/db/products";
import { gameIdSchema } from "@/lib/schemas/game.schema";
import { getUserByUsernameAndDiscriminator, getUserById } from "@/lib/db/users";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { toggleWinner, voteMVP } from "@/lib/db/matches";

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
    decks?: Record<string, string>;
    /**
     * Présent = la partie est saisie en rapport de bataille. Le formulaire le
     * pose d'office pour les jeux qui activent la fonctionnalité ; le champ est
     * accepté pour les autres, un joueur pouvant vouloir raconter une partie
     * dont le jeu n'a pas encore le fanion.
     */
    battleReport?: BattleReport;
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

    // Les listes d'armée sont saisies avant que les joueurs invités soient
    // résolus : celles qui ne retombent sur aucun joueur de la partie sont
    // abandonnées ici plutôt que d'entrer en base sans propriétaire.
    const battleReport = data.battleReport
      ? normalizeBattleReport(data.battleReport, resolvedPlayerIds)
      : undefined;

    // Valider les données
    const validationResult = gameMatchSchema.safeParse({
      gameId: data.gameId,
      playedAt: data.playedAt,
      lairId: data.lairId,
      playerIds: resolvedPlayerIds,
      decks: data.decks,
      battleReport,
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

export async function updatePlayerDeckAction(
  matchId: string,
  deckId: string | null
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
      return { success: false, error: "Vous devez être joueur de la partie pour modifier votre deck" };
    }

    // Mettre à jour le deck du joueur
    const updateOperation = deckId 
      ? { $set: { [`decks.${session.user.id}`]: deckId } }
      : { $unset: { [`decks.${session.user.id}`]: "" } };

    await db.collection("matches").updateOne(
      { _id: new ObjectId(matchId) },
      updateOperation
    );

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du deck:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

// ============================================================================
// RAPPORTS DE BATAILLE
// ============================================================================

/**
 * Figurines proposées à la saisie d'une liste d'armée.
 *
 * Le catalogue des produits est public — c'est la même source que la galerie
 * d'un jeu —, mais l'action reste réservée aux comptes connectés : elle ne sert
 * qu'à remplir un rapport de bataille, et seul un utilisateur connecté peut en
 * tenir un.
 */
export async function searchBattleReportUnitsAction(
  gameId: string,
  query: string
): Promise<GameProductSummary[]> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return [];
    }

    const validatedGameId = gameIdSchema.safeParse(gameId);
    if (!validatedGameId.success) {
      return [];
    }

    return await searchGameProducts(new ObjectId(validatedGameId.data), query, {
      // « Figurine » au sens du catalogue : ce qu'un joueur pose sur la table.
      kinds: ["unit"],
      limit: 10,
    });
  } catch (error) {
    console.error("Erreur lors de la recherche de figurines:", error);
    return [];
  }
}

/**
 * Scénario et notes du rapport. Réservés au créateur : ce sont les deux seuls
 * champs partagés de la fiche, et deux joueurs qui les écriraient en même temps
 * s'effaceraient l'un l'autre sans le voir. Chacun garde en revanche la main sur
 * sa propre liste d'armée (`updateBattleReportArmyAction`).
 */
export async function updateBattleReportAction(
  matchId: string,
  fields: { scenario?: string; notes?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const match = await getGameMatchById(matchId);

    if (!match) {
      return { success: false, error: "Partie non trouvée" };
    }

    if (!match.battleReport) {
      return { success: false, error: "Cette partie n'est pas un rapport de bataille" };
    }

    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Seul le créateur peut modifier le rapport" };
    }

    const validationResult = battleReportSchema
      .pick({ scenario: true, notes: true })
      .safeParse(fields);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Données invalides";
      return { success: false, error: errorMessage };
    }

    // Un champ absent de la saisie n'est pas touché ; un champ vidé est effacé.
    const result = await updateGameMatchBattleReport(matchId, {
      ...(fields.scenario !== undefined ? { scenario: validationResult.data.scenario ?? "" } : {}),
      ...(fields.notes !== undefined ? { notes: validationResult.data.notes ?? "" } : {}),
    });

    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour du rapport" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du rapport de bataille:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Liste d'armée d'un joueur. Chacun saisit la sienne ; le créateur peut saisir
 * celle des autres, parce que c'est souvent lui qui tient le rapport pour toute
 * la table.
 */
export async function updateBattleReportArmyAction(
  matchId: string,
  playerId: string,
  army: BattleReportArmy
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const match = await getGameMatchById(matchId);

    if (!match) {
      return { success: false, error: "Partie non trouvée" };
    }

    if (!match.battleReport) {
      return { success: false, error: "Cette partie n'est pas un rapport de bataille" };
    }

    const isCreator = match.createdBy === session.user.id;

    if (!isCreator && playerId !== session.user.id) {
      return { success: false, error: "Vous ne pouvez modifier que votre propre liste d'armée" };
    }

    if (!match.playerIds.includes(playerId)) {
      return { success: false, error: "Le joueur doit être dans la partie" };
    }

    const validationResult = battleReportArmySchema.safeParse(army);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Données invalides";
      return { success: false, error: errorMessage };
    }

    const result = await setGameMatchBattleReportArmy(
      matchId,
      playerId,
      normalizeArmy(validationResult.data)
    );

    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour de la liste d'armée" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la liste d'armée:", error);
    return { success: false, error: "Erreur serveur" };
  }
}

/**
 * Table de jeu du rapport : dimensions, décor, couleurs des joueurs et instants.
 *
 * Réservée au créateur, comme le scénario et les notes, et pour une raison de
 * plus : la table est un dessin unique. Deux joueurs qui déplaceraient des
 * jetons dans le même instant n'écraseraient pas seulement un champ l'un de
 * l'autre — ils repositionneraient toute la partie.
 *
 * Ce qui dépasse est **ramené** dans la table plutôt que refusé : un plateau
 * rétréci après coup ne doit pas rendre le rapport inenregistrable.
 */
export async function updateBattleMapAction(
  matchId: string,
  map: BattleMap
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const match = await getGameMatchById(matchId);

    if (!match) {
      return { success: false, error: "Partie non trouvée" };
    }

    if (!match.battleReport) {
      return { success: false, error: "Cette partie n'est pas un rapport de bataille" };
    }

    if (match.createdBy !== session.user.id) {
      return { success: false, error: "Seul le créateur peut modifier la table de jeu" };
    }

    const normalized = normalizeBattleMap(map, match.playerIds);
    const validationResult = battleMapSchema.safeParse(normalized);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || "Données invalides";
      return { success: false, error: errorMessage };
    }

    const result = await setGameMatchBattleMap(matchId, validationResult.data);

    if (!result) {
      return { success: false, error: "Erreur lors de la mise à jour de la table de jeu" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la table de jeu:", error);
    return { success: false, error: "Erreur serveur" };
  }
}
