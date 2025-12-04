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
  awardFeatToParticipant,
} from "@/lib/db/leagues";
import {
  League,
  CreateLeagueInput,
  UpdateLeagueInput,
  SearchLeaguesOptions,
  LeagueFormat,
  LeagueStatus,
  PaginatedLeaguesResult,
} from "@/lib/types/League";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

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
    if (params.format === "KILLER" && params.killerTargets !== undefined) {
      input.killerConfig = { targets: params.killerTargets };
    }
    if (params.format === "POINTS" && params.pointsRules !== undefined) {
      input.pointsConfig = {
        pointsRules: {
          participation: params.pointsRules.participation || 0,
          victory: params.pointsRules.victory || 2,
          defeat: params.pointsRules.defeat || 1,
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
