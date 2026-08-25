import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  getPlayGroupSession,
  setPlayGroupSessionRsvp,
} from "@/lib/db/play-group-sessions";
import { playGroupRsvpSchema } from "@/lib/schemas/play-group.schema";

type Params = Promise<{ playGroupId: string; sessionId: string }>;

/**
 * Répond présent — ou peut-être, ou non.
 *
 * `PUT` : la réponse remplace la précédente, et redonner la même l'**annule**.
 * C'est le comportement du web, et il a sa raison : se rétracter est le même
 * geste que répondre, sur le même bouton, sans quatrième état « je retire ma
 * réponse » à expliquer.
 *
 * Le corps porte `{ answer: "yes" | "maybe" | "no" }`. La réponse rend la
 * session entière : le compteur de présents change avec elle, et le client n'a
 * pas à le recalculer.
 */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = playGroupRsvpSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error },
        { status: 400 },
      );
    }

    const session = await getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      session: await setPlayGroupSessionRsvp(sessionId, gate.userId, parsed.data.answer),
    });
  } catch (error) {
    console.error("Error answering a play group session:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
