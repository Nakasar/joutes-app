import { NextResponse } from "next/server";

import { finishGameTable } from "@/lib/db/game-tables";
import { parseEngineResult, tableIdOfEngineGame } from "@/lib/engine/results";
import { engineServer } from "@/lib/engine/tables";
import { verifyBodySignature } from "@/lib/engine/tickets";

type ResultBody = {
  game?: unknown;
  result?: { winners?: unknown; reason?: unknown };
  turns?: unknown;
  points?: unknown;
};

/** Une annonce de fin tient en quelques centaines d'octets. */
const MAX_BODY = 16_384;

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

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "Corps trop long" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "Corps trop long" }, { status: 413 });
  }
  if (!verifyBodySignature(raw, request.headers.get("x-joutes-signature"), server.secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let body: ResultBody;
  try {
    body = JSON.parse(raw) as ResultBody;
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const result = parseEngineResult(body.result, body.turns, body.points);
  if (typeof body.game !== "string" || !result) {
    return NextResponse.json({ error: "Résultat incomplet" }, { status: 400 });
  }

  // Un second appel pour la même partie ne change rien : le serveur réessaie
  // quand notre réponse se perd. Le résultat d'une partie qui n'est plus celle
  // de la table (lancement abandonné) n'est pas enregistré non plus.
  const recorded = await finishGameTable(tableIdOfEngineGame(body.game), body.game, result);

  return NextResponse.json({ recorded });
}
