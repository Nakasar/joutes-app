import { NextResponse } from "next/server";
import { z } from "zod";
import { TournamentError } from "@/lib/db/tournaments";

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
