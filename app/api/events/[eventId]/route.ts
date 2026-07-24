import { NextRequest, NextResponse } from "next/server";
import { getEventById } from "@/lib/db/events";

type Params = { params: Promise<{ eventId: string }> };

/**
 * Détail d'un événement. Accès public au même titre que `GET /events` (pas
 * de contrôle par lair suivi ici) : la liste appelante a déjà scopé l'accès,
 * ce endpoint sert à résoudre un id déjà connu du client (ex. `/events/{id}`
 * sur mobile, hors du calendrier mois/année de la liste).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
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
