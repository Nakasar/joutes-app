"use server";

import {
  searchLeagues,
  createLeague,
  getLeagueById,
  updateLeague,
  deleteLeague,
  addParticipant,
  removeParticipant,
  getLeagueByInvitationCode,
  isLeagueOrganizer,
  addPointsToParticipant,
  recalculateLeaguePoints,
  getLeagueParticipantManageDetails,
  deleteLeagueParticipantFeat,
  deleteLeagueParticipantManualPointsEntry,
  awardFeatToParticipant,
  addLeagueMatch,
  deleteLeagueMatch,
  assignKillerTargets,
  reportKillerMatch,
  confirmKillerMatch,
  confirmKillerMatchLair,
  reportPointsLeagueMatch,
  confirmLeagueMatch,
  confirmLeagueMatchLair,
  updateLeagueMatchDeck,
} from "@/lib/db/leagues";
import { searchLairs } from "@/lib/db/lairs";
import {
  League,
  CreateLeagueInput,
  UpdateLeagueInput,
  SearchLeaguesOptions,
  LeagueFormat,
  LeagueStatus,
  PaginatedLeaguesResult,
  CreateLeagueMatchInput,
  KillerTarget,
} from "@/lib/types/League";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import {requireAdmin} from "@/lib/middleware/admin";

// Helper pour récupérer la session utilisateur
async function getSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}

// Helper pour vérifier que l'utilisateur est connecté
async function requireAuth() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Vous devez être connecté pour effectuer cette action");
  }
  return session.user;
}

// Rechercher des ligues
export type SearchLeaguesParams = {
  search?: string;
  status?: LeagueStatus | LeagueStatus[];
  format?: LeagueFormat;
  gameIds?: string[];
  page?: number;
  limit?: number;
};

export async function searchLeaguesAction(
  params: SearchLeaguesParams
): Promise<PaginatedLeaguesResult> {
  const session = await getSession();

  const options: SearchLeaguesOptions = {
    ...params,
    isPublic: true, // Par défaut, on ne montre que les ligues publiques
  };

  // Si l'utilisateur est connecté, on peut aussi montrer les ligues privées auxquelles il participe
  if (session?.user?.id) {
    // Pour l'instant, on garde simple et on ne montre que les publiques
    // On pourrait ajouter une logique plus complexe plus tard
  }

  return await searchLeagues(options);
}

// Créer une nouvelle ligue
export type CreateLeagueParams = {
  name: string;
  description?: string;
  banner?: string;
  format: LeagueFormat;
  killerTargets?: number;
  killerRequireLair?: boolean;
  killerEliminateOnDefeat?: boolean;
  pointsRules?: {
    participation: number;
    victory: number;
    defeat: number;
    feats?: Array<{
      id: string;
      title: string;
      description?: string;
      points: number;
      maxPerEvent?: number;
      maxPerLeague?: number;
    }>;
  };
  startDate?: string;
  endDate?: string;
  registrationDeadline?: string;
  maxParticipants?: number;
  minParticipants?: number;
  isPublic: boolean;
  gameIds: string[];
  lairIds: string[];
};

export async function createLeagueAction(
  params: CreateLeagueParams
): Promise<{ success: boolean; league?: League; error?: string }> {
  try {
    await requireAdmin();
    const user = await requireAuth();

    const input: CreateLeagueInput = {
      name: params.name,
      description: params.description,
      banner: params.banner,
      format: params.format,
      status: "DRAFT",
      creatorId: user.id,
      organizerIds: [user.id],
      isPublic: params.isPublic,
      gameIds: params.gameIds,
      lairIds: params.lairIds,
      maxParticipants: params.maxParticipants,
      minParticipants: params.minParticipants,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      registrationDeadline: params.registrationDeadline
        ? new Date(params.registrationDeadline)
        : undefined,
    };

    // Configuration spécifique au format
    if (params.format === "KILLER") {
      input.killerConfig = {
        targets: params.killerTargets || 1,
        requireLair: params.killerRequireLair ?? true,
        eliminateOnDefeat: params.killerEliminateOnDefeat ?? false,
      };
    } else if (params.format === "POINTS") {
      input.pointsConfig = {
        pointsRules: {
          participation: params.pointsRules?.participation || 0,
          victory: params.pointsRules?.victory || 2,
          defeat: params.pointsRules?.defeat || 1,
          feats: params.pointsRules?.feats || [],
        },
      };
    }

    const league = await createLeague(input);
    revalidatePath("/leagues");

    return { success: true, league };
  } catch (error) {
    console.error("Error creating league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la création",
    };
  }
}

// Mettre à jour une ligue
export async function updateLeagueAction(
  leagueId: string,
  params: Partial<CreateLeagueParams>
): Promise<{ success: boolean; league?: League; error?: string }> {
  try {
    const user = await requireAuth();

    // Vérifier que l'utilisateur est organisateur
    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à modifier cette ligue");
    }

    const input: UpdateLeagueInput = {};

    if (params.name !== undefined) input.name = params.name;
    if (params.description !== undefined) input.description = params.description;
    if (params.banner !== undefined) input.banner = params.banner;
    if (params.isPublic !== undefined) input.isPublic = params.isPublic;
    if (params.gameIds !== undefined) input.gameIds = params.gameIds;
    if (params.lairIds !== undefined) input.lairIds = params.lairIds;
    if (params.maxParticipants !== undefined)
      input.maxParticipants = params.maxParticipants;
    if (params.minParticipants !== undefined)
      input.minParticipants = params.minParticipants;
    if (params.startDate !== undefined)
      input.startDate = new Date(params.startDate);
    if (params.endDate !== undefined) input.endDate = new Date(params.endDate);
    if (params.registrationDeadline !== undefined)
      input.registrationDeadline = new Date(params.registrationDeadline);

    // Mise à jour de la configuration format
    if (
      params.format === "KILLER" &&
      (
        params.killerTargets !== undefined ||
        params.killerRequireLair !== undefined ||
        params.killerEliminateOnDefeat !== undefined
      )
    ) {
      const league = await getLeagueById(leagueId);
      if (!league || !league.killerConfig) {
        throw new Error("Ligue non trouvée");
      }

      input.killerConfig = {
        targets: params.killerTargets ?? league.killerConfig.targets ?? 1,
        requireLair: params.killerRequireLair ?? league.killerConfig.requireLair ?? true,
        eliminateOnDefeat:
          params.killerEliminateOnDefeat ??
          league.killerConfig.eliminateOnDefeat ??
          false,
      };
    }
    if (params.format === "POINTS" && params.pointsRules !== undefined) {
      input.pointsConfig = {
        pointsRules: {
          participation: params.pointsRules.participation ?? 0,
          victory: params.pointsRules.victory ?? 2,
          defeat: params.pointsRules.defeat ?? 1,
          feats: params.pointsRules.feats || [],
        },
      };
    }

    const league = await updateLeague(leagueId, input);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/leagues");

    return { success: true, league };
  } catch (error) {
    console.error("Error updating league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la mise à jour",
    };
  }
}

// Changer le statut d'une ligue
export async function updateLeagueStatusAction(
  leagueId: string,
  status: LeagueStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à modifier cette ligue");
    }

    await updateLeague(leagueId, { status });
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/leagues");

    return { success: true };
  } catch (error) {
    console.error("Error updating league status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la mise à jour",
    };
  }
}

// Supprimer une ligue
export async function deleteLeagueAction(
  leagueId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    // Seul le créateur peut supprimer
    if (league.creatorId !== user.id) {
      throw new Error("Seul le créateur peut supprimer cette ligue");
    }

    await deleteLeague(leagueId);
    revalidatePath("/leagues");

    return { success: true };
  } catch (error) {
    console.error("Error deleting league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la suppression",
    };
  }
}

// Rejoindre une ligue
export async function joinLeagueAction(
  leagueId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    // Vérifier que la ligue accepte les inscriptions
    if (league.status === "COMPLETED" || league.status === "CANCELLED") {
      throw new Error("Les inscriptions à cette ligue sont fermées");
    }

    // Vérifier la deadline d'inscription
    if (league.registrationDeadline && new Date() > league.registrationDeadline) {
      throw new Error("La date limite d'inscription est dépassée");
    }

    await addParticipant(leagueId, user.id);
    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error joining league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'inscription",
    };
  }
}

// Rejoindre une ligue avec un code d'invitation
export async function joinLeagueByCodeAction(
  code: string
): Promise<{ success: boolean; leagueId?: string; error?: string }> {
  try {
    const user = await requireAuth();

    const league = await getLeagueByInvitationCode(code);
    if (!league) {
      throw new Error("Code d'invitation invalide");
    }

    // Vérifier que la ligue accepte les inscriptions
    if (league.status === "COMPLETED" || league.status === "CANCELLED") {
      throw new Error("Les inscriptions à cette ligue sont fermées");
    }

    // Vérifier la deadline d'inscription
    if (league.registrationDeadline && new Date() > league.registrationDeadline) {
      throw new Error("La date limite d'inscription est dépassée");
    }

    await addParticipant(league.id, user.id);
    revalidatePath(`/leagues/${league.id}`);

    return { success: true, leagueId: league.id };
  } catch (error) {
    console.error("Error joining league by code:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'inscription",
    };
  }
}

// Quitter une ligue
export async function leaveLeagueAction(
  leagueId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    // Vérifier que la ligue n'est pas en cours
    if (league.status === "IN_PROGRESS") {
      throw new Error("Impossible de quitter une ligue en cours");
    }

    // Le créateur ne peut pas quitter
    if (league.creatorId === user.id) {
      throw new Error("Le créateur ne peut pas quitter sa propre ligue");
    }

    await removeParticipant(leagueId, user.id);
    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error leaving league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la désinscription",
    };
  }
}

// Ajouter des points à un participant (pour les organisateurs)
export async function addPointsAction(
  leagueId: string,
  userId: string,
  points: number,
  reason: string,
  eventId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await addPointsToParticipant(leagueId, userId, points, reason, eventId);
    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error adding points:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'ajout de points",
    };
  }
}

// Recalculer les points de tous les participants (pour les organisateurs)
export async function recalculateLeaguePointsAction(
  leagueId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await recalculateLeaguePoints(leagueId);
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error recalculating league points:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors du recalcul des points",
    };
  }
}

export type ParticipantManageFeatView = {
  id: string;
  featId: string;
  title: string;
  points: number;
  earnedAt: string;
  eventId?: string;
  matchId?: string;
};

export type ParticipantManageManualPointView = {
  historyIndex: number;
  date: string;
  points: number;
  reason: string;
  eventId?: string;
};

export type ParticipantManageDetailsView = {
  feats: ParticipantManageFeatView[];
  manualPoints: ParticipantManageManualPointView[];
};

export async function getParticipantManageDetailsAction(
  leagueId: string,
  userId: string
): Promise<{ success: boolean; details?: ParticipantManageDetailsView; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    const details = await getLeagueParticipantManageDetails(leagueId, userId);

    return {
      success: true,
      details: {
        feats: details.feats.map((feat) => ({
          id: feat.id,
          featId: feat.featId,
          title: feat.title,
          points: feat.points,
          earnedAt: DateTime.fromJSDate(feat.earnedAt).toISO() || new Date().toISOString(),
          eventId: feat.eventId,
          matchId: feat.matchId,
        })),
        manualPoints: details.manualPoints.map((entry) => ({
          historyIndex: entry.historyIndex,
          date: DateTime.fromJSDate(entry.date).toISO() || new Date().toISOString(),
          points: entry.points,
          reason: entry.reason,
          eventId: entry.eventId,
        })),
      },
    };
  } catch (error) {
    console.error("Error getting participant manage details:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors du chargement des détails",
    };
  }
}

export async function deleteParticipantFeatAction(
  leagueId: string,
  userId: string,
  participantFeatId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await deleteLeagueParticipantFeat(leagueId, userId, participantFeatId);

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting participant feat:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la suppression du haut fait",
    };
  }
}

export async function deleteParticipantManualPointsEntryAction(
  leagueId: string,
  userId: string,
  historyIndex: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await deleteLeagueParticipantManualPointsEntry(leagueId, userId, historyIndex);

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting participant manual points entry:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la suppression des points manuels",
    };
  }
}

// Attribuer un haut fait à un participant
export async function awardFeatAction(
  leagueId: string,
  userId: string,
  featId: string,
  eventId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await awardFeatToParticipant(leagueId, userId, featId, eventId);
    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error awarding feat:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de l'attribution du haut fait",
    };
  }
}

// Retirer un participant (pour les organisateurs)
export async function removeParticipantAction(
  leagueId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    // On ne peut pas retirer le créateur
    if (userId === league.creatorId) {
      throw new Error("Impossible de retirer le créateur de la ligue");
    }

    await removeParticipant(leagueId, userId);
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error removing participant:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors du retrait du participant",
    };
  }
}

// Ajouter un match à la ligue
export type AddLeagueMatchParams = {
  gameId: string;
  playedAt: string;
  playerIds: string[];
  playerScores?: Record<string, number>;
  winnerIds: string[];
  featAwards?: Array<{ playerId: string; featId: string }>;
  notes?: string;
};

export async function addLeagueMatchAction(
  leagueId: string,
  params: AddLeagueMatchParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("Ligue non trouvée");
    }

    // Vérifier que le jeu fait partie des jeux de la ligue
    if (!league.gameIds.includes(params.gameId)) {
      throw new Error("Ce jeu ne fait pas partie des jeux de la ligue");
    }

    // Vérifier qu'il y a au moins un joueur
    if (params.playerIds.length === 0) {
      throw new Error("Le match doit avoir au moins un joueur");
    }

    const matchInput: CreateLeagueMatchInput = {
      leagueId,
      matchType: "league",
      gameId: params.gameId,
      playedAt: new Date(params.playedAt),
      playerIds: params.playerIds,
      playerScores: params.playerScores,
      winnerIds: params.winnerIds,
      featAwards: params.featAwards,
      notes: params.notes,
    };

    await addLeagueMatch(leagueId, matchInput, user.id);
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error adding league match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de l'ajout du match",
    };
  }
}

export type ReportPointsLeagueMatchParams = {
  gameId: string;
  playedAt: string;
  playerIds: string[];
  winnerIds: string[];
  lairId?: string;
  lairName?: string;
  notes?: string;
};

export async function reportPointsLeagueMatchAction(
  leagueId: string,
  params: ReportPointsLeagueMatchParams
): Promise<{ success: boolean; matchId?: string; error?: string }> {
  try {
    const user = await requireAuth();

    const playedAt = DateTime.fromISO(params.playedAt);
    if (!playedAt.isValid) {
      throw new Error("Date de match invalide");
    }

    const matchId = await reportPointsLeagueMatch(leagueId, user.id, {
      gameId: params.gameId,
      playedAt: playedAt.toJSDate(),
      playerIds: params.playerIds,
      winnerIds: params.winnerIds,
      lairId: params.lairId,
      lairName: params.lairName,
      notes: params.notes,
    });

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/notifications");

    return { success: true, matchId };
  } catch (error) {
    console.error("Error reporting points league match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors du rapport du match",
    };
  }
}

export async function searchPlatformLairsAction(
  query: string
): Promise<{ success: boolean; lairs?: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const user = await requireAuth();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { success: true, lairs: [] };
    }

    const results = await searchLairs({
      userId: user.id,
      search: trimmedQuery,
      page: 1,
      limit: 20,
    });

    return {
      success: true,
      lairs: results.lairs.map((lair) => ({ id: lair.id, name: lair.name })),
    };
  } catch (error) {
    console.error("Error searching platform lairs:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la recherche de lieux",
    };
  }
}

// Supprimer un match de la ligue
export async function deleteLeagueMatchAction(
  leagueId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const canManage = await isLeagueOrganizer(leagueId, user.id);
    if (!canManage) {
      throw new Error("Vous n'êtes pas autorisé à gérer cette ligue");
    }

    await deleteLeagueMatch(leagueId, matchId);
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting league match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la suppression du match",
    };
  }
}

export async function generateKillerTargetsAction(
  leagueId: string
): Promise<{ success: boolean; targets?: KillerTarget[]; error?: string }> {
  try {
    const user = await requireAuth();
    const targets = await assignKillerTargets(leagueId, user.id);

    revalidatePath(`/leagues/${leagueId}`);

    return { success: true, targets };
  } catch (error) {
    console.error("Error generating killer targets:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la génération des cibles",
    };
  }
}

export type ReportKillerMatchParams = {
  matchId?: string;
  targetId?: string;
  winnerId: string;
  playerScores?: Record<string, number>;
  playedAt: string;
  reporterDeckId?: string | null;
};

export async function reportKillerMatchAction(
  leagueId: string,
  params: ReportKillerMatchParams
): Promise<{ success: boolean; matchId?: string; error?: string }> {
  try {
    const user = await requireAuth();
    const matchId = await reportKillerMatch(
      leagueId,
      user.id,
      params.targetId,
      params.winnerId,
      params.playerScores,
      new Date(params.playedAt),
      params.reporterDeckId,
      params.matchId
    );

    revalidatePath(`/leagues/${leagueId}`);

    return { success: true, matchId };
  } catch (error) {
    console.error("Error reporting killer match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors du rapport du match",
    };
  }
}

export async function confirmKillerMatchAction(
  leagueId: string,
  matchId: string,
  confirmerDeckId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    await confirmKillerMatch(leagueId, matchId, user.id);

    if (confirmerDeckId !== undefined) {
      await updateLeagueMatchDeck(leagueId, matchId, user.id, user.id, confirmerDeckId);
    }

    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error confirming killer match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la confirmation",
    };
  }
}

export async function updateLeagueMatchDeckAction(
  leagueId: string,
  matchId: string,
  playerId: string,
  deckId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    await updateLeagueMatchDeck(leagueId, matchId, user.id, playerId, deckId);

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath(`/leagues/${leagueId}/manage`);

    return { success: true };
  } catch (error) {
    console.error("Error updating league match deck:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la mise à jour du deck",
    };
  }
}

export async function confirmKillerMatchLairAction(
  leagueId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    await confirmKillerMatchLair(leagueId, matchId, user.id);

    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error confirming killer match lair:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la confirmation du lieu",
    };
  }
}

export async function confirmLeagueMatchAction(
  leagueId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    await confirmLeagueMatch(leagueId, matchId, user.id);

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/notifications");

    return { success: true };
  } catch (error) {
    console.error("Error confirming league match:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la confirmation",
    };
  }
}

export async function confirmLeagueMatchLairAction(
  leagueId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    await confirmLeagueMatchLair(leagueId, matchId, user.id);

    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/notifications");

    return { success: true };
  } catch (error) {
    console.error("Error confirming league match lair:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erreur lors de la confirmation du lieu",
    };
  }
}
