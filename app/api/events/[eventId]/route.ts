import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getEventById } from "@/lib/db/events";
import { canJoinDirectly, isWaitlistOpen, viewerWaitlistStatus } from "@/lib/events/waitlist";

type Params = { params: Promise<{ eventId: string }> };

/**
 * Détail d'un événement, pour résoudre un id déjà connu du client (ex.
 * `/events/{id}` sur mobile, hors du calendrier mois/année de la liste).
 *
 * Même règle d'accès que la page web `/events/{eventId}` : un événement
 * privé (`lairId` absent) n'est visible que par son créateur ou un
 * participant — sans ce contrôle, connaître/deviner un id suffirait à lire
 * un événement privé.
 *
 * Porte aussi l'état de la liste d'attente vu par la personne connectée
 * (`viewerWaitlist`), que l'app mobile affiche et fait avancer par
 * `/events/{id}/waitlist`.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }

    const session = await auth.api.getSession({ headers: await headers() });

    const isPrivateEvent = !event.lairId;
    if (isPrivateEvent) {
      const isCreator = session?.user && event.creatorId === session.user.id;
      const isParticipant = session?.user && event.participants?.includes(session.user.id);
      if (!isCreator && !isParticipant) {
        return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      }
    }

    // La file ne sort pas telle quelle : qui attend ne regarde que
    // l'organisation. Le client reçoit sa taille, et la place de la personne
    // connectée — rang et offre en cours.
    const { waitlist, participantRegisteredAt: _registeredAt, ...publicEvent } = event;
    const now = new Date();

    return NextResponse.json({
      ...publicEvent,
      waitlistCount: waitlist?.length ?? 0,
      waitlistOpen: isWaitlistOpen(event, now),
      canJoinDirectly: canJoinDirectly(event, now),
      viewerWaitlist: session?.user ? viewerWaitlistStatus(event, session.user.id, now) : null,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'événement" },
      { status: 500 }
    );
  }
}
