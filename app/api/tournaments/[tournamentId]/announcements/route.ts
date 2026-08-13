import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createAnnouncementSchema } from "@/lib/schemas/tournament.schema";
import {
  assertCanManage,
  createAnnouncement,
  listAnnouncements,
  listPlayers,
  recordActivity,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";
import { notifyAnnouncement } from "@/lib/tournaments/notifications";

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const announcements = await listAnnouncements(tournamentId);
    return NextResponse.json(announcements);
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertCanManage(tournament, user.userId);

    const body = await request.json();
    const validated = createAnnouncementSchema.parse(body);

    const announcement = await createAnnouncement(tournamentId, {
      message: validated.message,
      level: validated.level,
      createdBy: user.userId,
    });
    await recordActivity(tournamentId, "announcement-sent", { level: validated.level });

    // Une annonce n'existait que sur l'écran du tournoi, que l'application
    // interroge toutes les huit secondes : la lire supposait de le regarder.
    // La pousser, c'est ce qui fait qu'un « reprise à 14 h » atteint quelqu'un
    // parti déjeuner. L'envoi n'est jamais bloquant.
    try {
      await notifyAnnouncement(tournament, announcement, await listPlayers(tournamentId));
    } catch (error) {
      console.error("Notification d'annonce échouée", error);
    }

    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
