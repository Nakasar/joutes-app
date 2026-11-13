import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { registerToEvent, unregisterFromEvent, type RegistrationResult } from "@/lib/events/registration-service";
import { readWaitlistRequest } from "../waitlist/access";

type Params = { params: Promise<{ eventId: string }> };

function registrationResponse(eventId: string, result: RegistrationResult): NextResponse {
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, ...(result.full ? { full: true } : {}) },
      { status: result.status }
    );
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return NextResponse.json({ success: true, registrationStatus: result.registrationStatus ?? null });
}

/**
 * S'inscrire à un événement (app mobile). Mêmes règles que l'action du site :
 * inscriptions ouvertes, événement pas commencé, place libre — sinon
 * `409` avec `full: true`, et l'inscription passe par la liste d'attente.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return registrationResponse(eventId, await registerToEvent(context.event, context.userId));
  } catch (error) {
    console.error("Error registering to event:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** Se désinscrire ; la place libérée est offerte au premier de la file. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return registrationResponse(eventId, await unregisterFromEvent(eventId, context.userId));
  } catch (error) {
    console.error("Error unregistering from event:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
