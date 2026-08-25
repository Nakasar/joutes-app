import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  getPlayGroupSession,
  togglePlayGroupSlotVote,
} from "@/lib/db/play-group-sessions";

type Params = Promise<{ playGroupId: string; sessionId: string }>;

const voteSchema = z.strictObject({ slotId: z.string().trim().min(1).max(64) });

/**
 * Bascule la disponibilité du membre sur un créneau du sondage.
 *
 * **Une bascule assumée, contrairement au suivi.** Se déclarer disponible n'est
 * pas un engagement qu'un double envoi laisserait dans un état trompeur : un
 * créneau coché deux fois revient décoché, ce que le sondage affiche
 * immédiatement, et rien n'est perdu. Le partager en deux verbes obligerait le
 * client à savoir où il en est avant de parler, alors que l'écriture en base
 * est déjà ciblée sur le seul créneau visé.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = voteSchema.safeParse(await request.json());
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

    const updated = await togglePlayGroupSlotVote(sessionId, parsed.data.slotId, gate.userId);
    if (!updated) {
      // Le créneau n'existe pas, ou le sondage a été tranché entre-temps : dans
      // les deux cas, il n'y a plus rien à voter.
      return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });
    }

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Error voting on a play group slot:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
