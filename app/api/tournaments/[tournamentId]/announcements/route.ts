import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { createAnnouncementSchema } from "@/lib/schemas/tournament.schema";
import {
  assertIsOrganizer,
  createAnnouncement,
  listAnnouncements,
  requireTournament,
} from "@/lib/db/tournaments";
import { tournamentErrorResponse, unauthorizedResponse } from "../../utils";

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const { tournamentId } = await params;
    const tournament = await requireTournament(tournamentId);
    assertIsOrganizer(tournament, user.userId);

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
    assertIsOrganizer(tournament, user.userId);

    const body = await request.json();
    const validated = createAnnouncementSchema.parse(body);

    const announcement = await createAnnouncement(tournamentId, {
      message: validated.message,
      level: validated.level,
      createdBy: user.userId,
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
