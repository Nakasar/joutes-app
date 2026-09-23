import { NextRequest, NextResponse } from "next/server";
import { declineEventWaitlistOffer } from "@/lib/events/waitlist-service";
import { readWaitlistRequest, waitlistResponse } from "../access";

type Params = { params: Promise<{ eventId: string }> };

/** Décliner la place offerte : la personne quitte la file, le suivant est notifié. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return waitlistResponse(await declineEventWaitlistOffer(context.event, context.userId));
  } catch (error) {
    console.error("Error declining waitlist offer:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
