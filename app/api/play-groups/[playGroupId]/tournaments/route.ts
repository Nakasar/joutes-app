import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import { groupPalmares, readGroupTournamentFilters } from "@/lib/play-groups/tournaments";
import { listUpcomingRegistrations, readGroupTournaments } from "@/lib/tournaments/result-service";

type Params = Promise<{ playGroupId: string }>;

/**
 * Les tournois des membres, pour l'application mobile : la timeline de la vue
 * `?view=tournaments`, avec les mêmes filtres (`jeu`, `membre`, `legende`,
 * `top8=1`, `avant=AAAA-MM`), le palmarès et les inscriptions à venir.
 * Réservé aux membres, qui voient tous les résultats des membres actuels.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  try {
    const memberIds = gate.group.members.map((member) => member.userId);
    const filters = readGroupTournamentFilters(Object.fromEntries(request.nextUrl.searchParams));
    const [{ summaries, timeline }, upcoming] = await Promise.all([
      readGroupTournaments(memberIds, filters),
      listUpcomingRegistrations(memberIds),
    ]);
    const inGame = filters.gameId ? summaries.filter((result) => result.gameId === filters.gameId) : summaries;

    return NextResponse.json({ ...timeline, palmares: groupPalmares(inGame), upcoming });
  } catch (error) {
    console.error("Error reading play-group tournaments:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
