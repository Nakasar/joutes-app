import { NextRequest, NextResponse } from "next/server";
import { joinEventWaitlist, leaveEventWaitlist } from "@/lib/events/waitlist-service";
import { readWaitlistRequest, waitlistResponse } from "./access";

type Params = { params: Promise<{ eventId: string }> };

/** Rejoindre la liste d'attente d'un événement complet. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return waitlistResponse(await joinEventWaitlist(context.event, context.userId));
  } catch (error) {
    console.error("Error joining event waitlist:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** Quitter la liste d'attente (une offre en cours passe au suivant). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return waitlistResponse(await leaveEventWaitlist(context.event, context.userId));
  } catch (error) {
    console.error("Error leaving event waitlist:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
