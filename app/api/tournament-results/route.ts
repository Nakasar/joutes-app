import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  claimLocatorResult,
  declareResult,
  deleteResult,
  listMyResults,
  resultErrorStatus,
  searchLocatorPlayers,
  searchResultTournaments,
  updateMyResult,
  type ResultServiceError,
} from "@/lib/tournaments/result-service";

/**
 * Mes résultats en tournoi, pour l'application mobile. Mêmes règles que les
 * écrans, par le même service (`lib/tournaments/result-service.ts`).
 *
 * Une seule route, sans segment dynamique (plafond de routes Vercel) :
 * - GET : mes résultats ; `?search=` cherche un tournoi (Joutes et locator) ;
 *   `?event=<tournoi importé>&player=` cherche un joueur du locator ;
 * - POST : `kind: "declared"` déclare, `kind: "locator"` reconnaît un joueur ;
 * - PATCH `?id=` : lier un deck (`deckId`, `null` pour délier), visibilité ;
 * - DELETE `?id=` : supprimer un résultat déclaré ou reconnu.
 */

function fail(error: ResultServiceError) {
  return NextResponse.json({ error }, { status: resultErrorStatus(error) });
}

async function readUserId(request: NextRequest): Promise<string | null> {
  return (await authenticateApiRequest(request))?.userId ?? null;
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function serverError(where: string, error: unknown) {
  console.error(`tournament-results ${where}`, error);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const userId = await readUserId(request);
    const event = params.get("event");
    if (event) {
      const found = await searchLocatorPlayers(userId, event, params.get("player") ?? "");
      return found.ok ? NextResponse.json({ players: found.players }) : fail(found.error);
    }

    const search = params.get("search");
    if (search !== null) {
      const found = await searchResultTournaments(userId, search, params.get("gameId") ?? undefined);
      return found.ok ? NextResponse.json({ joutes: found.joutes, locator: found.locator }) : fail(found.error);
    }

    const mine = await listMyResults(userId);
    return mine.ok ? NextResponse.json({ results: mine.results }) : fail(mine.error);
  } catch (error) {
    return serverError("GET", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await readUserId(request);
    const body = await readBody(request);
    if (!body) return fail("INVALID");

    const outcome =
      body.kind === "locator"
        ? await claimLocatorResult(userId, body)
        : body.kind === "declared"
          ? await declareResult(userId, body)
          : ({ ok: false, error: "INVALID" } as const);

    return outcome.ok ? NextResponse.json(outcome.result, { status: 201 }) : fail(outcome.error);
  } catch (error) {
    return serverError("POST", error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await readUserId(request);
    const id = request.nextUrl.searchParams.get("id");
    const body = await readBody(request);
    if (!id || !body) return fail("INVALID");

    const outcome = await updateMyResult(userId, id, body);
    return outcome.ok ? NextResponse.json(outcome.result) : fail(outcome.error);
  } catch (error) {
    return serverError("PATCH", error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await readUserId(request);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return fail("INVALID");

    const outcome = await deleteResult(userId, id);
    return outcome.ok ? NextResponse.json({ deleted: true }) : fail(outcome.error);
  } catch (error) {
    return serverError("DELETE", error);
  }
}
