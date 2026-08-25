import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  confirmPlayGroupSessionSlot,
  getPlayGroupSession,
} from "@/lib/db/play-group-sessions";

type Params = Promise<{ playGroupId: string; sessionId: string }>;

const confirmSchema = z.strictObject({ slotId: z.string().trim().min(1).max(64) });

/**
 * Tranche le sondage : le créneau devient la date de la session.
 *
 * Réservé au fondateur et aux admins — c'est la décision qui engage tout le
 * groupe. Ceux qui s'étaient déclarés disponibles sur ce créneau sont repris
 * comme présents : s'être dit disponible jeudi *est* une réponse pour jeudi, et
 * redemander serait poser deux fois la même question.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId, { manage: true });
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = confirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const session = await getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const updated = await confirmPlayGroupSessionSlot(sessionId, parsed.data.slotId);
    if (!updated) {
      return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });
    }

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Error confirming a play group slot:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
