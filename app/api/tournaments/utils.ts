import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getPlayerBySyncKey, TournamentError, TournamentPrincipal } from "@/lib/db/tournaments";

/**
 * Résout le principal d'une requête sur l'API tournoi : un joueur via sa clé
 * de synchronisation `tpsk_...` en Bearer (limité à SON tournoi), sinon un
 * utilisateur authentifié (session ou clé API `jts_`).
 */
export async function resolveTournamentPrincipal(
  request: Request,
  tournamentId: string
): Promise<TournamentPrincipal | null> {
  const authorization = request.headers.get("authorization") ?? undefined;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;

  if (token?.startsWith("tpsk_")) {
    const player = await getPlayerBySyncKey(token);
    if (player && player.tournamentId === tournamentId) {
      return { kind: "player", player };
    }
    return null;
  }

  const user = await authenticateApiRequest(request);
  return user ? { kind: "user", userId: user.userId } : null;
}

const STATUS_BY_CODE: Record<TournamentError["code"], number> = {
  "not-found": 404,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
};

export function tournamentErrorResponse(error: unknown): NextResponse {
  if (error instanceof TournamentError) {
    return NextResponse.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }
  console.error("Erreur API tournois:", error);
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
}
