import { NextRequest, NextResponse } from "next/server";
import { getTournamentById, listAnnouncements, TournamentError } from "@/lib/db/tournaments";
import { tournamentErrorResponse } from "../../utils";

/**
 * État « live » d'un tournoi diffusé aux joueurs et à la page timer : annonces
 * et minuteur, avec l'horloge serveur (`serverNow`) pour synchroniser le
 * décompte côté client malgré un éventuel décalage d'horloge. Lecture publique.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const tournament = await getTournamentById(tournamentId);
    if (!tournament) {
      throw new TournamentError("not-found", "Tournoi non trouvé");
    }

    const announcements = await listAnnouncements(tournamentId);
    return NextResponse.json({
      name: tournament.name,
      // Forme publique minimale : n'expose pas createdBy / tournamentId.
      announcements: announcements.map((a) => ({
        id: a.id,
        message: a.message,
        level: a.level,
        createdAt: a.createdAt,
      })),
      timer: tournament.timer ?? null,
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
