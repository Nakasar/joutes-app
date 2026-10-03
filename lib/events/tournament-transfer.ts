import "server-only";

import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import type { EventImportCandidate } from "@/lib/db/tournaments";
import type { Event } from "@/lib/types/Event";
import type { GuestParticipant } from "@/lib/schemas/event-portal.schema";
import { playerStatusForRegistration } from "./tournament-link";

/**
 * Transfert des inscrits d'un événement vers son tournoi.
 *
 * L'événement tient les inscriptions (comptes, invités, statuts, liste
 * d'attente) ; le tournoi tient ses joueurs. Le transfert recopie les premiers
 * dans les seconds, et peut être rejoué : il n'ajoute que les absents et aligne
 * le statut des présents (cf. `planEventPlayersImport`).
 */

const GUEST_PARTICIPANTS_COLLECTION = "event-guest-participants";
const USERS_COLLECTION = "user";

// Participants de l'événement (comptes + invités) convertis en candidats au
// transfert : nom affiché + statut de joueur de tournoi.
export async function listEventImportCandidates(event: Event): Promise<EventImportCandidate[]> {
  const candidates: EventImportCandidate[] = [];

  const userIds = event.participants ?? [];
  if (userIds.length > 0) {
    const users = await db
      .collection(USERS_COLLECTION)
      .find({ _id: { $in: userIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } })
      .toArray();
    const usersById = new Map(users.map((u) => [u._id.toString(), u]));
    for (const userId of userIds) {
      const status = playerStatusForRegistration(event.participantRegistrations?.[userId]);
      if (!status) continue;
      const user = usersById.get(userId);
      candidates.push({
        userId,
        displayName: (user?.displayName || user?.username || "Joueur") as string,
        status,
      });
    }
  }

  // Invités de l'événement : toujours inscrits (pas de statut par invité).
  const guests = await db
    .collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION)
    .find({ eventId: event.id })
    .toArray();
  for (const guest of guests) {
    candidates.push({
      userId: guest.userId,
      displayName: guest.username,
      status: "registered",
    });
  }

  return candidates;
}
