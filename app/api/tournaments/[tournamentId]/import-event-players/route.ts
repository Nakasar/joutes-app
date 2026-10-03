import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getEventById } from "@/lib/db/events";
import {
  applyEventPlayersImport,
  assertCanManage,
  planEventPlayersImport,
  requireTournament,
} from "@/lib/db/tournaments";
import { listEventImportCandidates } from "@/lib/events/tournament-transfer";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

async function loadContext(request: NextRequest, tournamentId: string) {
  const user = await authenticateApiRequest(request);
  if (!user) return { error: unauthorizedResponse() };

  const tournament = await requireTournament(tournamentId);
  assertCanManage(tournament, user.userId);

  if (!tournament.eventId) {
    return {
      error: NextResponse.json(
        { error: "Ce tournoi n'est lié à aucun événement" },
        { status: 409 }
      ),
    };
  }
  const event = await getEventById(tournament.eventId);
  if (!event) {
    return {
      error: NextResponse.json({ error: "Événement lié non trouvé" }, { status: 404 }),
    };
  }
  return { user, tournament, event };
}

// Aperçu de l'import : joueurs qui seront ajoutés (avec leur statut), joueurs
// existants dont le statut va changer, inchangés.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const ctx = await loadContext(request, tournamentId);
    if ("error" in ctx) return ctx.error;

    const candidates = await listEventImportCandidates(ctx.event);
    const plan = await planEventPlayersImport(tournamentId, candidates);
    return NextResponse.json({ event: { id: ctx.event.id, name: ctx.event.name }, ...plan });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

// Applique l'import des participants de l'événement dans le tournoi.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const ctx = await loadContext(request, tournamentId);
    if ("error" in ctx) return ctx.error;

    const candidates = await listEventImportCandidates(ctx.event);
    const result = await applyEventPlayersImport(tournamentId, candidates, ctx.user.userId);
    return NextResponse.json(result);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
