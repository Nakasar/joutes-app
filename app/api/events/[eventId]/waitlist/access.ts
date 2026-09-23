import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getEventById } from "@/lib/db/events";
import type { Event } from "@/lib/types/Event";
import type { WaitlistOperationResult } from "@/lib/events/waitlist-service";

/**
 * Session et événement d'une requête de liste d'attente, avec la même règle
 * d'accès que `GET /events/{eventId}` : un événement privé ne s'ouvre qu'à son
 * créateur et à ses participants. Rend une réponse d'erreur toute faite sinon.
 */
export async function readWaitlistRequest(
  eventId: string
): Promise<{ userId: string; event: Event } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const event = await getEventById(eventId);
  if (!event) {
    return { response: NextResponse.json({ error: "Événement introuvable" }, { status: 404 }) };
  }

  if (!event.lairId) {
    const isCreator = event.creatorId === session.user.id;
    const isParticipant = event.participants?.includes(session.user.id);
    if (!isCreator && !isParticipant) {
      return { response: NextResponse.json({ error: "Accès non autorisé" }, { status: 403 }) };
    }
  }

  return { userId: session.user.id, event };
}

/** Traduit le résultat d'une opération de file en réponse HTTP. */
export function waitlistResponse(result: WaitlistOperationResult): NextResponse {
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
