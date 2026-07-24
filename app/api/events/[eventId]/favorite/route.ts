import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addEventToFavorites, getEventById, removeEventFromFavorites } from "@/lib/db/events";

type Params = { params: Promise<{ eventId: string }> };

/** Bascule le favori de l'utilisateur connecté sur cet événement. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }

    // Même règle d'accès que GET /events/{eventId} : un favori ne doit pas
    // permettre de "voir" un événement privé auquel on n'a par ailleurs pas
    // accès (le favori conditionne sa présence dans la liste de l'utilisateur).
    const isPrivateEvent = !event.lairId;
    if (isPrivateEvent) {
      const isCreator = event.creatorId === session.user.id;
      const isParticipant = event.participants?.includes(session.user.id);
      if (!isCreator && !isParticipant) {
        return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      }
    }

    const wasFavorited = event.favoritedBy?.includes(session.user.id) ?? false;
    if (wasFavorited) {
      await removeEventFromFavorites(eventId, session.user.id);
    } else {
      await addEventToFavorites(eventId, session.user.id);
    }

    // On relit l'état réel plutôt que de supposer que la mutation a réussi
    // (événement supprimé entre-temps, mise à jour concurrente...).
    const updated = await getEventById(eventId);
    const favorited = updated?.favoritedBy?.includes(session.user.id) ?? false;

    return NextResponse.json({ favorited });
  } catch (error) {
    console.error("Error toggling event favorite:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
