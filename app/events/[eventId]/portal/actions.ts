"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
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
import { calculateStandings, generateBracketPosition, generateEliminationBracket, generateNextBracketRound, generateSwissPairings } from "@/lib/utils/pairing";
import { getEventParticipants } from "./participant-actions";
import { inspect } from "util";

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

    revalidatePath(`/events/${validated.eventId}/portal/organizer`);

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

    const matchQuery: Record<string, unknown> = { eventId };
    if (phaseId) {
      matchQuery.phaseId = phaseId;
    }

    // Agrégation pour joindre les informations des joueurs
    const pipeline = [
      { $match: matchQuery },
      // Lookup pour player1 dans la collection users
      {
        $lookup: {
          from: "user",
          let: { player1Id: { $cond: [{ $eq: ["$player1Id", null] }, null, { $toObjectId: "$player1Id" }] } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$player1Id"] } } },
            { $project: { displayName: 1, username: 1, discriminator: 1, profileImage: 1 } }
          ],
          as: "player1Info"
        }
      },
      // Lookup pour player2 dans la collection users
      {
        $lookup: {
          from: "user",
          let: { player2Id: { $cond: [{ $eq: ["$player2Id", null] }, null, { $toObjectId: "$player2Id" }] } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$player2Id"] } } },
            { $project: { displayName: 1, username: 1, discriminator: 1, profileImage: 1 } }
          ],
          as: "player2Info"
        }
      },
      // Lookup pour player1 dans la collection guest-participants
      {
        $lookup: {
          from: "event-guest-participants",
          localField: "player1Id",
          foreignField: "id",
          as: "player1GuestInfo"
        }
      },
      // Lookup pour player2 dans la collection guest-participants
      {
        $lookup: {
          from: "event-guest-participants",
          localField: "player2Id",
          foreignField: "id",
          as: "player2GuestInfo"
        }
      },
      // Ajouter les champs player1Name et player2Name
      {
        $addFields: {
          player1Name: {
            $cond: [
              { $eq: ["$player1Id", null] },
              "BYE",
              {
                $cond: [
                  { $gt: [{ $size: "$player1Info" }, 0] },
                  {
                    $let: {
                      vars: {
                        user: { $arrayElemAt: ["$player1Info", 0] }
                      },
                      in: {
                        $concat: [
                          { $ifNull: ["$$user.displayName", "$$user.username"] },
                          "#",
                          "$$user.discriminator"
                        ]
                      }
                    }
                  },
                  {
                    $cond: [
                      { $gt: [{ $size: "$player1GuestInfo" }, 0] },
                      {
                        $let: {
                          vars: {
                            guest: { $arrayElemAt: ["$player1GuestInfo", 0] }
                          },
                          in: {
                            $cond: [
                              { $ne: [{ $ifNull: ["$$guest.discriminator", null] }, null] },
                              {
                                $concat: [
                                  "$$guest.username",
                                  "#",
                                  "$$guest.discriminator"
                                ]
                              },
                              "$$guest.username"
                            ]
                          }
                        }
                      },
                      "Joueur inconnu"
                    ]
                  }
                ]
              }
            ]
          },
          player2Name: {
            $cond: [
              { $eq: ["$player2Id", null] },
              "BYE",
              {
                $cond: [
                  { $gt: [{ $size: "$player2Info" }, 0] },
                  {
                    $let: {
                      vars: {
                        user: { $arrayElemAt: ["$player2Info", 0] }
                      },
                      in: {
                        $concat: [
                          { $ifNull: ["$$user.displayName", "$$user.username"] },
                          "#",
                          "$$user.discriminator"
                        ]
                      }
                    }
                  },
                  {
                    $cond: [
                      { $gt: [{ $size: "$player2GuestInfo" }, 0] },
                      {
                        $let: {
                          vars: {
                            guest: { $arrayElemAt: ["$player2GuestInfo", 0] }
                          },
                          in: {
                            $cond: [
                              { $ne: [{ $ifNull: ["$$guest.discriminator", null] }, null] },
                              {
                                $concat: [
                                  "$$guest.username",
                                  "#",
                                  "$$guest.discriminator"
                                ]
                              },
                              "$$guest.username"
                            ]
                          }
                        }
                      },
                      "Joueur inconnu"
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      // Supprimer les champs temporaires
      {
        $project: {
          player1Info: 0,
          player2Info: 0,
          player1GuestInfo: 0,
          player2GuestInfo: 0
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return {
      success: true,
      data: results.map((r: any) => ({
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
      status: 'completed' as const,
      reportedBy: session.user.id,
      confirmedBy: session.user.id,
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

    // Récupérer les paramètres du portail pour vérifier requireConfirmation
    const settingsCollection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);
    const settings = await settingsCollection.findOne({ eventId });

    const requireConfirmation = settings?.requireConfirmation ?? false;

    const winnerId = validated.player1Score > validated.player2Score ? match.player1Id
      : validated.player2Score > validated.player1Score ? match.player2Id
      : undefined;

    const updateData: Partial<MatchResult> = {
      player1Score: validated.player1Score,
      player2Score: validated.player2Score,
      winnerId,
      reportedBy: session.user.id,
      status: requireConfirmation ? 'in-progress' : 'completed',
      updatedAt: new Date().toISOString(),
    };

    // Si pas de confirmation requise, marquer comme confirmé directement
    if (!requireConfirmation) {
      updateData.confirmedBy = session.user.id;
    }

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
      return { success: false, error: "Seul le créateur de l'événement peut modifier un résultat" };
    }

    const match = await db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION).findOne({ matchId, eventId });

    if (!match) {
      return { success: false, error: "Match non trouvé" };
    }

    const winnerId = validated.player1Score > validated.player2Score ? match.player1Id
      : validated.player2Score > validated.player1Score ? match.player2Id
      : null;

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    await collection.updateOne(
      { matchId, eventId },
      {
        $set: {
          player1Score: validated.player1Score,
          player2Score: validated.player2Score,
          winnerId,
          status: 'completed',
          reportedBy: session.user.id,
          confirmedBy: session.user.id,
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

export async function deleteRoundMatches(eventId: string, phaseId: string, round: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut supprimer des matchs" };
    }

    const collection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    const result = await collection.deleteMany({ 
      eventId, 
      phaseId, 
      round 
    });

    return { 
      success: true,
      data: { deletedCount: result.deletedCount }
    };
  } catch (error) {
    console.error("Erreur lors de la suppression des matchs de la ronde:", error);
    return { success: false, error: "Erreur lors de la suppression des matchs de la ronde" };
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

    return { success: true, data: { ... announcement, _id: undefined, id: announcement.id.toString(), createdBy: announcement.createdBy.toString() } };
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

    await collection.deleteOne({ _id: new ObjectId(announcementId), eventId });

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression de l&apos;annonce:", error);
    return { success: false, error: "Erreur lors de la suppression de l&apos;annonce" };
  }
}

// =====================
// GÉNÉRATION DE MATCHS
// =====================

export async function generateMatchesForPhase(eventId: string, phaseId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Non authentifié" };
    }

    // Vérifier que l'utilisateur est le créateur de l'événement
    const isCreator = await isEventCreator(eventId, session.user.id);
    if (!isCreator) {
      return { success: false, error: "Seul le créateur de l&apos;événement peut générer des matchs" };
    }

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement non trouvé" };
    }

    // Récupérer les paramètres du portail
    const settingsCollection = db.collection<EventPortalSettings>(PORTAL_SETTINGS_COLLECTION);
    const settings = await settingsCollection.findOne({ eventId });

    if (!settings) {
      return { success: false, error: "Paramètres du portail non trouvés" };
    }

    // Trouver la phase
    const phase = settings.phases.find(p => p.id === phaseId);
    if (!phase) {
      return { success: false, error: "Phase non trouvée" };
    }

    // Récupérer tous les participants (incluant les invités)
    const participantsResult = await getEventParticipants(eventId);

    if (!participantsResult.success || !participantsResult.data) {
      return { success: false, error: "Impossible de récupérer les participants" };
    }

    const participants = participantsResult.data;
    if (participants.length < 2) {
      return { success: false, error: "Au moins 2 participants sont requis pour générer des matchs" };
    }

    const playerIds = participants.map(p => p.id);

    // Récupérer les matchs existants pour cette phase
    const matchesCollection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);

    // Générer les pairings selon le type de phase
    let pairings: Array<{ player1Id: string; player2Id: string | null }> = [];
    let roundNumber = 1;

    if (phase.type === "swiss") {
      const existingMatches = await matchesCollection.find<MatchResult>({ eventId, phaseId }).toArray();

      // Déterminer le numéro de ronde
      if (existingMatches.length > 0) {
        const maxRound = Math.max(...existingMatches.map(m => m.round || 1));
        // Vérifier si tous les matchs de la dernière ronde sont terminés
        const lastRoundMatches = existingMatches.filter(m => (m.round || 1) === maxRound);
        const allCompleted = lastRoundMatches.every(m => m.status === "completed");

        if (!allCompleted) {
          return {
            success: false,
            error: `Tous les matchs de la ronde ${maxRound} doivent être terminés avant de générer la ronde suivante`
          };
        }

        roundNumber = maxRound + 1;
      }

      // Vérifier que nous ne dépassons pas le nombre de rondes
      if (phase.rounds && roundNumber > phase.rounds) {
        return {
          success: false,
          error: `Toutes les rondes (${phase.rounds}) ont déjà été générées`
        };
      }

      pairings = generateSwissPairings(playerIds, existingMatches, roundNumber);
    } else if (phase.type === "bracket") {
      const existingMatches = await matchesCollection.find<MatchResult>({ eventId, phaseId }).toArray();
      
      // Si des matchs existent déjà, générer la ronde suivante
      if (existingMatches.length > 0) {
        const maxRound = Math.max(...existingMatches.map(m => m.round || 1));
        // Vérifier si tous les matchs de la dernière ronde sont terminés
        const lastRoundMatches = existingMatches.filter(m => (m.round || 1) === maxRound);
        const allCompleted = lastRoundMatches.every(m => m.status === "completed");

        if (!allCompleted) {
          return {
            success: false,
            error: `Tous les matchs de la ronde ${maxRound} doivent être terminés avant de générer la ronde suivante`
          };
        }

        // Vérifier si c'est déjà la finale (1 seul match dans la dernière ronde)
        if (lastRoundMatches.length === 1) {
          return {
            success: false,
            error: "La finale a déjà été générée, le bracket est complet"
          };
        }

        roundNumber = maxRound + 1;
        
        try {
          pairings = generateNextBracketRound(lastRoundMatches);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Erreur lors de la génération de la ronde suivante"
          };
        }
      } else {
        // Première ronde : utiliser le classement de la phase précédente
        const currentPhaseIndex = settings.phases.findIndex(p => p.id === phaseId);
        if (currentPhaseIndex === -1) {
          return { success: false, error: "Phase non trouvée dans les paramètres" };
        }
        const previousPhase = settings.phases[currentPhaseIndex - 1];
        if (!previousPhase) {
          return { success: false, error: "Phase précédente non trouvée pour générer le bracket" };
        }

        roundNumber = 1;
        const previousPhaseMatches = await matchesCollection.find<MatchResult>({
          eventId,
          phaseId: previousPhase.id,
        }).toArray();

        // Passer le paramètre topCut pour limiter aux N premiers du classement
        pairings = generateEliminationBracket(playerIds, previousPhaseMatches, phase.topCut);
      }
    }
    // Créer les matchs
    const newMatches: Array<MatchResult & { eventId: string }> = [];
    const now = new Date().toISOString();

    for (let i = 0; i < pairings.length; i++) {
      const pairing = pairings[i];
      const matchId = `match-${eventId}-${phaseId}-r${roundNumber}-${i}`;

      // Déterminer si c'est un BYE et calculer le score automatique
      const isBye = pairing.player2Id === null;
      let player1Score = 0;
      let player2Score = 0;
      let status: "pending" | "completed" = "pending";
      let winnerId: string | undefined = undefined;
      let reportedBy: string | undefined = undefined;
      let confirmedBy: string | undefined = undefined;

      if (isBye) {
        // Pour un BYE, le joueur gagne automatiquement avec le score maximal
        switch (phase.matchType) {
          case "BO1":
            player1Score = 1;
            break;
          case "BO2":
            player1Score = 2;
            break;
          case "BO3":
            player1Score = 2;
            break;
          case "BO5":
            player1Score = 3;
            break;
        }
        status = "completed";
        winnerId = pairing.player1Id;
        reportedBy = session.user.id; // L'organisateur
        confirmedBy = session.user.id;
      }

      const match = {
        matchId,
        eventId,
        phaseId,
        player1Id: pairing.player1Id,
        player2Id: pairing.player2Id,
        player1Score,
        player2Score,
        winnerId,
        round: roundNumber,
        bracketPosition: phase.type === "bracket"
          ? generateBracketPosition(i, pairings.length)
          : undefined,
        status,
        reportedBy,
        confirmedBy,
        createdAt: now,
        updatedAt: now,
      };

      newMatches.push(match);
    }

    // Insérer tous les matchs
    if (newMatches.length > 0) {
      await matchesCollection.insertMany(newMatches as any);
    }

    return {
      success: true,
      data: {
        matchesCreated: newMatches.length,
        roundNumber,
        matches: newMatches.map(m => ({
          ...m,
          id: m.matchId,
          _id: undefined,
        })),
      }
    };
  } catch (error) {
    console.error("Erreur lors de la génération des matchs:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Erreur lors de la génération des matchs" };
  }
}

// =====================
// CLASSEMENT
// =====================

export async function getPhaseStandings(eventId: string, phaseId: string) {
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

    const event = await getEventById(eventId);
    if (!event) {
      return { success: false, error: "Événement non trouvé" };
    }

    // Récupérer les participants avec leurs noms via agrégation
    const usersCollection = db.collection("user");
    const guestsCollection = db.collection("event-guest-participants");
    
    // Construire la liste des IDs de participants
    const participantIds = event.participants || [];
    
    // Récupérer les utilisateurs via agrégation
    const userParticipants = await usersCollection.find({
      _id: { $in: participantIds.map(id => ObjectId.createFromHexString(id)) }
    }).project({
      _id: 1,
      displayName: 1,
      username: 1,
      discriminator: 1
    }).toArray();

    // Récupérer les invités
    const guestParticipants = await guestsCollection.find({ eventId }).project({
      id: 1,
      username: 1,
      discriminator: 1
    }).toArray();

    // Créer une map des participants pour un accès rapide
    const participantsMap = new Map();
    userParticipants.forEach((user: any) => {
      const id = user._id.toString();
      participantsMap.set(id, {
        id,
        username: user.displayName || user.username,
        discriminator: user.discriminator
      });
    });
    guestParticipants.forEach((guest: any) => {
      participantsMap.set(guest.id, {
        id: guest.id,
        username: guest.username,
        discriminator: guest.discriminator
      });
    });

    const playerIds = Array.from(participantsMap.keys());

    // Récupérer les matchs de la phase
    const matchesCollection = db.collection<MatchResult & { eventId: string }>(MATCH_RESULTS_COLLECTION);
    const matches = await matchesCollection.find({ eventId, phaseId }).toArray();

    // Calculer le classement
    const standings = calculateStandings(playerIds, matches as any);

    // Enrichir avec les informations des participants
    const enrichedStandings = standings.map(standing => {
      const participant = participantsMap.get(standing.playerId);
      return {
        ...standing,
        username: participant?.username || "Inconnu",
        discriminator: participant?.discriminator,
      };
    });

    return {
      success: true,
      data: enrichedStandings,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération du classement:", error);
    return { success: false, error: "Erreur lors de la récupération du classement" };
  }
}
