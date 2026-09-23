import { NextResponse } from "next/server";
import { listEventIdsWithWaitlist } from "@/lib/db/event-waitlist";
import { advanceEventWaitlist } from "@/lib/events/waitlist-service";

/**
 * Relève des listes d'attente.
 *
 * Tout ce qui libère une place fait déjà avancer la file dans la foulée. Reste
 * ce qu'aucune action ne déclenche : une offre qui arrive à échéance sans
 * réponse. Ce passage sort ces joueurs de la file et offre leur place au
 * suivant, et vide les files des événements commencés, annulés ou passés.
 */
export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const eventIds = await listEventIdsWithWaitlist();
    let offered = 0;
    let expired = 0;

    for (const eventId of eventIds) {
      const result = await advanceEventWaitlist(eventId);
      offered += result.offered;
      expired += result.expired;
    }

    return NextResponse.json({ events: eventIds.length, offered, expired });
  } catch (error) {
    console.error("Cron des listes d'attente en échec", error);
    return NextResponse.json({ error: "Erreur lors du traitement des listes d'attente" }, { status: 500 });
  }
}
