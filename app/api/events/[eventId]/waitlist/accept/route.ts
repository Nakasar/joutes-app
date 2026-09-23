import { NextRequest, NextResponse } from "next/server";
import { acceptEventWaitlistOffer } from "@/lib/events/waitlist-service";
import { readWaitlistRequest, waitlistResponse } from "../access";

type Params = { params: Promise<{ eventId: string }> };

/** Accepter la place offerte : la personne connectée devient inscrite. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params;
    const context = await readWaitlistRequest(eventId);
    if ("response" in context) return context.response;

    return waitlistResponse(await acceptEventWaitlistOffer(context.event, context.userId));
  } catch (error) {
    console.error("Error accepting waitlist offer:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
