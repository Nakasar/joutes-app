import "server-only";

import type { Event } from "@/lib/types/Event";
import { notifyEventParticipants, notifyUser } from "@/lib/services/notifications";
import { hasScheduleChanged, rescheduleMessage } from "./schedule-change";

/**
 * Les notifications de cycle de vie d'un événement : report et suppression.
 *
 * Aucune ne lève : une notification perdue ne doit pas faire échouer la
 * modification ou la suppression qui l'a déclenchée.
 */

type Schedule = Pick<Event, "startDateTime" | "endDateTime">;

/**
 * Prévient les inscrits quand l'horaire change vraiment. Sans effet si les
 * dates sont réécrites à l'identique, ou si personne n'est inscrit.
 */
export async function notifyEventRescheduledIfNeeded(
  event: Pick<Event, "id" | "name" | "participants">,
  before: Schedule,
  after: Partial<Schedule>
): Promise<void> {
  if (!event.participants?.length) return;
  if (!hasScheduleChanged(before, after)) return;

  try {
    const { title, description } = rescheduleMessage(event.name, before, {
      startDateTime: after.startDateTime ?? before.startDateTime,
    });
    await notifyEventParticipants(event.id, title, description);
  } catch (error) {
    console.error(`Notification de report de l'événement ${event.id} échouée`, error);
  }
}

/**
 * Prévient les inscrits — et les joueurs en liste d'attente — qu'un événement
 * est supprimé.
 *
 * Des notifications **par joueur**, et non une notification d'événement : une
 * fois l'événement effacé, une notification qui le cible ne trouve plus son
 * audience — ni dans la liste des notifications, ni pour le push. La personne
 * qui supprime n'est pas prévenue de son propre geste.
 */
export async function notifyEventDeleted(
  event: Pick<Event, "id" | "name" | "startDateTime" | "participants" | "waitlist">,
  actorId?: string
): Promise<void> {
  const recipients = new Set([
    ...(event.participants ?? []),
    ...(event.waitlist ?? []).map((entry) => entry.userId),
  ]);
  if (actorId) recipients.delete(actorId);

  const participants = new Set(event.participants ?? []);

  await Promise.all(
    [...recipients].map((userId) =>
      notifyUser(
        userId,
        "🗑️ Événement supprimé",
        participants.has(userId)
          ? `L'événement « ${event.name} » auquel vous étiez inscrit a été supprimé.`
          : `L'événement « ${event.name} » pour lequel vous étiez en liste d'attente a été supprimé.`
      ).catch((error) => {
        console.error(`Notification de suppression de ${event.id} à ${userId} échouée`, error);
      })
    )
  );
}
