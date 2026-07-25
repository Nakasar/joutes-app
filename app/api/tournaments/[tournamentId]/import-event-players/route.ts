import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import db from "@/lib/mongodb";
import { getEventById } from "@/lib/db/events";
import {
  applyEventPlayersImport,
  assertCanManage,
  planEventPlayersImport,
  requireTournament,
  type EventImportCandidate,
} from "@/lib/db/tournaments";
import type { Event, RegistrationStatus } from "@/lib/types/Event";
import type { GuestParticipant } from "@/lib/schemas/event-portal.schema";
import type { TournamentPlayerStatus } from "@/lib/types/Tournament";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

const GUEST_PARTICIPANTS_COLLECTION = "event-guest-participants";
const USERS_COLLECTION = "user";

// Statut de joueur de tournoi correspondant à un statut d'inscription à
// l'événement. NOT_REGISTERED n'est pas importé.
const STATUS_MAPPING: Partial<Record<RegistrationStatus, TournamentPlayerStatus>> = {
  REGISTERED: "registered",
  PRE_REGISTERED: "pre-registered",
  EXCLUDED: "dropped",
};

// Participants de l'événement (comptes + invités) convertis en candidats à
// l'import : nom affiché + statut de joueur de tournoi.
async function listEventImportCandidates(event: Event): Promise<EventImportCandidate[]> {
  const candidates: EventImportCandidate[] = [];

  const userIds = event.participants ?? [];
  if (userIds.length > 0) {
    const users = await db
      .collection(USERS_COLLECTION)
      .find({ _id: { $in: userIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } })
      .toArray();
    const usersById = new Map(users.map((u) => [u._id.toString(), u]));
    for (const userId of userIds) {
      const status = STATUS_MAPPING[event.participantRegistrations?.[userId] ?? "REGISTERED"];
      if (!status) continue;
      const user = usersById.get(userId);
      candidates.push({
        userId,
        displayName: (user?.displayName || user?.username || "Joueur") as string,
        status,
      });
    }
  }

  // Invités de l'événement : toujours inscrits (pas de statut par invité).
  const guests = await db
    .collection<GuestParticipant>(GUEST_PARTICIPANTS_COLLECTION)
    .find({ eventId: event.id })
    .toArray();
  for (const guest of guests) {
    candidates.push({
      userId: guest.userId,
      displayName: guest.username,
      status: "registered",
    });
  }

  return candidates;
}

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
