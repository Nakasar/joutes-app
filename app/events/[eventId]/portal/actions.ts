"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import {
  createPortalSettingsSchema,
  createPhaseSchema,
  createMatchResultSchema,
  reportMatchResultSchema,
  confirmMatchResultSchema,
  createAnnouncementSchema,
  EventPortalSettings,
  TournamentPhase,
  MatchResult,
  Announcement,
} from "@/lib/schemas/event-portal.schema";
import { getEventById } from "@/lib/db/events";

const PORTAL_SETTINGS_COLLECTION = "event-portal-settings";
const MATCH_RESULTS_COLLECTION = "event-match-results";
const ANNOUNCEMENTS_COLLECTION = "event-announcements";

// Vérifier si l'utilisateur est le créateur de l'événement
async function isEventCreator(eventId: string, userId: string): Promise<boolean> {
  const event = await getEventById(eventId);
  return event?.creatorId === userId;
}

// Vérifier si l'utilisateur est participant de l'événement
async function isEventParticipant(eventId: string, userId: string): Promise<boolean> {
  const event = await getEventById(eventId);
  return event?.participants?.includes(userId) || false;
}

// =====================
// PARAMÈTRES DU PORTAIL
// =====================

export async function getPortalSettings(eventId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const collection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);
    
    const settings = await collection.findOne({ eventId });
    
    if (!settings) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        ...settings,
        id: settings._id?.toString(),
        _id: undefined,
      },
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres du portail:", error);
    return { success: false, error: "Erreur lors de la récupération des paramètres" };
  }
}

export async function createOrUpdatePortalSettings(data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = createPortalSettingsSchema.parse(data);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(validated.eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut modifier les paramètres" };
    }

    const collection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);

    const now = new Date().toISOString();
    const settings = {
      ...validated,
      updatedAt: now,
    };

    const existing = await collection.findOne({ eventId: validated.eventId });

    if (existing) {
      await collection.updateOne(
        { eventId: validated.eventId },
        { $set: settings }
      );
    } else {
      await collection.insertOne({
        ...settings,
        createdAt: now,
      } as EventPortalSettings);
    }

    return { success: true, data: settings };
  } catch (error) {
    console.error("Erreur lors de la création/modification des paramètres:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la création/modification des paramètres" };
  }
}

// =====================
// PHASES
// =====================

export async function addPhase(eventId: string, phaseData: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = createPhaseSchema.parse(phaseData);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut ajouter une phase" };
    }

    const collection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);

    const newPhase: TournamentPhase = {
      ...validated,
      id: new ObjectId().toString(),
      status: 'not-started',
    };

    const result = await collection.updateOne(
      { eventId },
      {
        $push: { phases: newPhase },
        $set: { updatedAt: new Date().toISOString() },
      }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: "Paramètres du portail non trouvés" };
    }

    return { success: true, data: newPhase };
  } catch (error) {
    console.error("Erreur lors de l&apos;ajout de la phase:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de l&apos;ajout de la phase" };
  }
}

export async function updatePhaseStatus(eventId: string, phaseId: string, status: 'not-started' | 'in-progress' | 'completed') {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut modifier le statut d&apos;une phase" };
    }

    const collection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);

    const result = await collection.updateOne(
      { eventId, "phases.id": phaseId },
      {
        $set: {
          "phases.$.status": status,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: "Phase non trouvée" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour du statut de la phase:", error);
    return { success: false, error: "Erreur lors de la mise à jour du statut" };
  }
}

export async function setCurrentPhase(eventId: string, phaseId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut changer la phase courante" };
    }

    const collection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);

    const result = await collection.updateOne(
      { eventId },
      {
        $set: {
          currentPhaseId: phaseId,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: "Paramètres du portail non trouvés" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la phase courante:", error);
    return { success: false, error: "Erreur lors de la mise à jour de la phase courante" };
  }
}

// =====================
// RÉSULTATS DE MATCHS
// =====================

export async function getMatchResults(eventId: string, phaseId?: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur a accès à l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    const isParticipant = await isEventParticipant(eventId, session.user.id);
    
    if (!isCreator && !isParticipant) {
      return { success: false, error: "Accès non autorisé" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);
    
    const query: Record<string, unknown> = { eventId };
    if (phaseId) {
      query.phaseId = phaseId;
    }

    const results = await collection.find(query).toArray();
    
    return {
      success: true,
      data: results.map((r: typeof results[0]) => ({
        ...r,
        id: r._id?.toString(),
        _id: undefined,
      })),
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des résultats:", error);
    return { success: false, error: "Erreur lors de la récupération des résultats" };
  }
}

export async function createMatchResult(eventId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = createMatchResultSchema.parse(data);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut créer un match" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    const now = new Date().toISOString();
    const matchResult = {
      ...validated,
      eventId,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(matchResult);

    return {
      success: true,
      data: {
        ...matchResult,
        id: result.insertedId.toString(),
      },
    };
  } catch (error) {
    console.error("Erreur lors de la création du match:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la création du match" };
  }
}

export async function reportMatchResult(eventId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = reportMatchResultSchema.parse(data);

    // Vérifier que l'utilisateur est participant
    const isParticipant = await isEventParticipant(eventId, session.user.id);
    const isCreator = await isEventCreator(eventId, session.user.id);
    
    if (!isParticipant && !isCreator) {
      return { success: false, error: "Vous devez être participant pour rapporter un résultat" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    // Récupérer le match
    const match = await collection.findOne({
      matchId: validated.matchId,
      eventId,
    });

    if (!match) {
      return { success: false, error: "Match non trouvé" };
    }

    // Vérifier que l'utilisateur fait partie du match
    if (match.player1Id !== session.user.id && match.player2Id !== session.user.id && !isCreator) {
      return { success: false, error: "Vous ne faites pas partie de ce match" };
    }

    const updateData: Partial<MatchResult> = {
      player1Score: validated.player1Score,
      player2Score: validated.player2Score,
      winnerId: validated.winnerId,
      reportedBy: session.user.id,
      status: 'in-progress',
      updatedAt: new Date().toISOString(),
    };

    await collection.updateOne(
      { matchId: validated.matchId, eventId },
      { $set: updateData }
    );

    return { success: true };
  } catch (error) {
    console.error("Erreur lors du rapport du résultat:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors du rapport du résultat" };
  }
}

export async function confirmMatchResult(eventId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = confirmMatchResultSchema.parse(data);

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    // Récupérer le match
    const match = await collection.findOne({
      matchId: validated.matchId,
      eventId,
    });

    if (!match) {
      return { success: false, error: "Match non trouvé" };
    }

    // Vérifier que l'utilisateur fait partie du match et n'est pas celui qui a rapporté
    if (match.reportedBy === session.user.id) {
      return { success: false, error: "Vous ne pouvez pas confirmer votre propre rapport" };
    }

    if (match.player1Id !== session.user.id && match.player2Id !== session.user.id) {
      // Vérifier si l'utilisateur est le créateur
      const isCreator = await isEventCreator(eventId, session.user.id);
      if (!isCreator) {
        return { success: false, error: "Vous ne faites pas partie de ce match" };
      }
    }

    await collection.updateOne(
      { matchId: validated.matchId, eventId },
      {
        $set: {
          confirmedBy: session.user.id,
          status: 'completed',
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la confirmation du résultat:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la confirmation du résultat" };
  }
}

export async function updateMatchResult(eventId: string, matchId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = reportMatchResultSchema.parse(data);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut modifier un résultat" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    await collection.updateOne(
      { matchId, eventId },
      {
        $set: {
          player1Score: validated.player1Score,
          player2Score: validated.player2Score,
          winnerId: validated.winnerId,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la modification du résultat:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la modification du résultat" };
  }
}

export async function deleteMatchResult(eventId: string, matchId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut supprimer un match" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    await collection.deleteOne({ matchId, eventId });

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression du match:", error);
    return { success: false, error: "Erreur lors de la suppression du match" };
  }
}

// =====================
// ANNONCES
// =====================

export async function getAnnouncements(eventId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur a accès à l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    const isParticipant = await isEventParticipant(eventId, session.user.id);
    
    if (!isCreator && !isParticipant) {
      return { success: false, error: "Accès non autorisé" };
    }

    const collection = db.collection<Announcement & { eventId: string }>(ANNOUNCEMENTS_COLLECTION);
    
    const announcements = await collection.find({ eventId }).sort({ createdAt: -1 }).toArray();
    
    return {
      success: true,
      data: announcements.map((a: typeof announcements[0]) => ({
        ...a,
        id: a._id?.toString(),
        _id: undefined,
      })),
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des annonces:", error);
    return { success: false, error: "Erreur lors de la récupération des annonces" };
  }
}

export async function createAnnouncement(eventId: string, data: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    const validated = createAnnouncementSchema.parse(data);

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut créer une annonce" };
    }

    const collection = db.collection<Announcement & { eventId: string }>(ANNOUNCEMENTS_COLLECTION);

    const announcement: Announcement = {
      ...validated,
      id: new ObjectId().toString(),
      eventId,
      createdBy: session.user.id,
      createdAt: new Date().toISOString(),
    };

    await collection.insertOne(announcement as Announcement & { _id?: ObjectId });

    return { success: true, data: announcement };
  } catch (error) {
    console.error("Erreur lors de la création de l&apos;annonce:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la création de l&apos;annonce" };
  }
}

export async function deleteAnnouncement(eventId: string, announcementId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut supprimer une annonce" };
    }

    const collection = db.collection<Announcement & { eventId: string }>(ANNOUNCEMENTS_COLLECTION);

    await collection.deleteOne({ id: announcementId, eventId });

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression de l&apos;annonce:", error);
    return { success: false, error: "Erreur lors de la suppression de l&apos;annonce" };
  }
}
