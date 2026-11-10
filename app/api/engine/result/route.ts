import { NextResponse } from "next/server";

import { finishGameTable } from "@/lib/db/game-tables";
import { engineServer } from "@/lib/engine/tables";
import { verifyBodySignature } from "@/lib/engine/tickets";

type ResultBody = {
  game?: unknown;
  result?: { winners?: unknown; reason?: unknown };
  turns?: unknown;
  points?: unknown;
};

/**
 * Fin d'une partie en ligne, annoncée par le serveur de parties
 * (`JOUTES_RESULT_URL` de son côté). L'appel est signé avec le secret partagé :
 * sans signature valide, rien n'est écrit.
 */
export async function POST(request: Request) {
  const server = engineServer();
  if (!server) {
    return NextResponse.json({ error: "Jeu en ligne non configuré" }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyBodySignature(raw, request.headers.get("x-joutes-signature"), server.secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let body: ResultBody;
  try {
    body = JSON.parse(raw) as ResultBody;
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const winners = body.result?.winners;
  if (
    typeof body.game !== "string" ||
    !Array.isArray(winners) ||
    !winners.every((seat) => Number.isInteger(seat)) ||
    typeof body.result?.reason !== "string"
  ) {
    return NextResponse.json({ error: "Résultat incomplet" }, { status: 400 });
  }

  const points =
    Array.isArray(body.points) && body.points.every((value) => Number.isInteger(value))
      ? (body.points as number[])
      : undefined;

  // Un second appel pour la même partie ne change rien : le serveur réessaie
  // quand notre réponse se perd.
  const recorded = await finishGameTable(body.game, {
    winners: winners as number[],
    reason: body.result.reason,
    ...(typeof body.turns === "number" ? { turns: body.turns } : {}),
    ...(points ? { points } : {}),
  });

  return NextResponse.json({ recorded });
}
