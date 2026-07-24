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

    const wasFavorited = event.favoritedBy?.includes(session.user.id) ?? false;
    if (wasFavorited) {
      await removeEventFromFavorites(eventId, session.user.id);
    } else {
      await addEventToFavorites(eventId, session.user.id);
    }

    return NextResponse.json({ favorited: !wasFavorited });
  } catch (error) {
    console.error("Error toggling event favorite:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
