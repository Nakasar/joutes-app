import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  createPlayGroupSession,
  listPlayGroupSessions,
} from "@/lib/db/play-group-sessions";
import { playGroupSessionSchema } from "@/lib/schemas/play-group.schema";
import type { PlayGroupSessionStatus } from "@/lib/types/PlayGroupSession";

type Params = Promise<{ playGroupId: string }>;

const STATUSES: PlayGroupSessionStatus[] = ["poll", "confirmed", "cancelled"];

/**
 * Les sessions du groupe : sondages en tête, puis les dates confirmées.
 *
 * Réservé aux membres. Une session dit qui vient jouer, où et quand — c'est
 * l'intérieur du groupe, pas sa vitrine.
 *
 * `status` filtre ce qu'on veut lire ; sans lui, les sondages et les sessions
 * confirmées, comme sur l'Établi. Les sessions annulées ne remontent que si on
 * les demande : elles restent lisibles pour comprendre un trou dans l'agenda,
 * sans encombrer la liste courante.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const asked = request.nextUrl.searchParams.getAll("status");
    const statuses = asked.filter((value): value is PlayGroupSessionStatus =>
      STATUSES.includes(value as PlayGroupSessionStatus),
    );

    return NextResponse.json({
      sessions: await listPlayGroupSessions(
        playGroupId,
        statuses.length > 0 ? { statuses } : {},
      ),
    });
  } catch (error) {
    console.error("Error listing play group sessions:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * Propose une session — une date ferme, ou des créneaux à sonder.
 *
 * C'est la même route pour les deux parce que c'est le même objet : un sondage
 * tranché *devient* la session, sans changer d'identité ni perdre les
 * disponibilités déjà exprimées.
 *
 * Ouvert à tous les membres : proposer une soirée n'est pas un acte de
 * gouvernance. Trancher le sondage, en revanche, l'est.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = playGroupSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const session = await createPlayGroupSession({
      playGroupId,
      title: parsed.data.title,
      gameId: parsed.data.gameId,
      place: parsed.data.place,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      slots: parsed.data.slots,
      pollClosesAt: parsed.data.pollClosesAt,
      createdById: gate.userId,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating a play group session:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
