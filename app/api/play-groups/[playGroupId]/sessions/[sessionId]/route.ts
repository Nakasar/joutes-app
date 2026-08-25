import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer, type PlayGroupViewer } from "@/lib/api/play-groups";
import {
  deletePlayGroupSession,
  getPlayGroupSession,
  updatePlayGroupSession,
} from "@/lib/db/play-group-sessions";
import { playGroupSessionSchema } from "@/lib/schemas/play-group.schema";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";

type Params = Promise<{ playGroupId: string; sessionId: string }>;

/**
 * La session, à condition qu'elle appartienne bien à ce groupe.
 *
 * Les identifiants de session sont globaux : sans cette vérification, être
 * membre d'un groupe suffirait à lire la session d'un autre en devinant son
 * identifiant.
 */
async function readSession(
  playGroupId: string,
  sessionId: string,
): Promise<PlayGroupSession | null> {
  const session = await getPlayGroupSession(sessionId);
  return session && session.playGroupId === playGroupId ? session : null;
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const session = await readSession(playGroupId, sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error reading a play group session:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * Qui peut toucher à une session : son auteur, ou un responsable.
 *
 * Celui qui a proposé la soirée peut la corriger et l'annuler — c'est la sienne
 * — mais pas celle d'un autre. C'est exactement le partage de
 * `cancelPlayGroupSession` côté web.
 */
function mayEdit(gate: PlayGroupViewer, session: PlayGroupSession): boolean {
  return gate.canManage || session.createdById === gate.userId;
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const session = await readSession(playGroupId, sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!mayEdit(gate, session)) {
      return NextResponse.json(
        { error: "Action réservée à l'auteur de la session et aux responsables" },
        { status: 403 },
      );
    }

    const parsed = playGroupSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Les créneaux ne se modifient pas ici : un sondage se tranche par
    // `/confirm`, et réécrire ses créneaux effacerait les voix déjà exprimées.
    const updated = await updatePlayGroupSession(sessionId, {
      title: parsed.data.title,
      gameId: parsed.data.gameId,
      place: parsed.data.place,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Error updating a play group session:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * Annule la session — elle n'est pas effacée.
 *
 * Le web l'annule sans jamais la supprimer, et c'est ce qui explique un trou
 * dans l'agenda : « annulée » se lit, « disparue » laisse chercher. `DELETE`
 * dit ici « retire-la de l'agenda », pas « efface toute trace ».
 */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, sessionId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    const session = await readSession(playGroupId, sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (!mayEdit(gate, session)) {
      return NextResponse.json(
        { error: "Action réservée à l'auteur de la session et aux responsables" },
        { status: 403 },
      );
    }

    // `purge=1` efface pour de bon : réservé aux responsables, et utile pour
    // retirer une session créée par erreur plutôt que de laisser « annulée »
    // sur quelque chose qui n'a jamais existé.
    if (request.nextUrl.searchParams.get("purge") === "1") {
      if (!gate.canManage) {
        return NextResponse.json(
          { error: "Action réservée aux responsables du groupe" },
          { status: 403 },
        );
      }

      await deletePlayGroupSession(sessionId);
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({
      session: await updatePlayGroupSession(sessionId, { status: "cancelled" }),
    });
  } catch (error) {
    console.error("Error cancelling a play group session:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
