import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getEventById } from "@/lib/db/events";

type Params = { params: Promise<{ eventId: string }> };

/**
 * Détail d'un événement, pour résoudre un id déjà connu du client (ex.
 * `/events/{id}` sur mobile, hors du calendrier mois/année de la liste).
 *
 * Même règle d'accès que la page web `/events/{eventId}` : un événement
 * privé (`lairId` absent) n'est visible que par son créateur ou un
 * participant — sans ce contrôle, connaître/deviner un id suffirait à lire
 * un événement privé.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }

    const isPrivateEvent = !event.lairId;
    if (isPrivateEvent) {
      const session = await auth.api.getSession({ headers: await headers() });
      const isCreator = session?.user && event.creatorId === session.user.id;
      const isParticipant = session?.user && event.participants?.includes(session.user.id);
      if (!isCreator && !isParticipant) {
        return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      }
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'événement" },
      { status: 500 }
    );
  }
}
