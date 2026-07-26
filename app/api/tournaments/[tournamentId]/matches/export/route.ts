import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import {
  canManageTournament,
  getRoundById,
  getTournamentById,
  listMatchesByRound,
  listMatchesByTournament,
  listPhases,
  listPlayers,
  listRounds,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import {
  buildCsvFileName,
  buildMatchExportEntries,
  buildMatchesCsv,
} from "@/lib/tournaments/match-export";
import type { TournamentMatchStatus } from "@/lib/types/Tournament";

const MATCH_STATUSES: TournamentMatchStatus[] = ["pending", "in-progress", "completed", "disputed"];

/**
 * Liste des matchs du tournoi au format CSV. `roundId` restreint l'export à une
 * ronde. Réservé au staff du tournoi : le CSV porte les noms des joueurs.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tournament = await getTournamentById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournoi introuvable" }, { status: 404 });
    }
    if (!canManageTournament(tournament, session.user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const roundId = request.nextUrl.searchParams.get("roundId") || undefined;
    const round = roundId ? await getRoundById(tournamentId, roundId) : null;
    if (roundId && !round) {
      return NextResponse.json({ error: "Ronde introuvable" }, { status: 404 });
    }

    const [matches, players, phases, rounds, t] = await Promise.all([
      round ? listMatchesByRound(tournamentId, round.id) : listMatchesByTournament(tournamentId),
      listPlayers(tournamentId),
      listPhases(tournamentId),
      listRounds(tournamentId),
      getTranslations("Tournaments"),
    ]);

    const entries = buildMatchExportEntries({
      // Le CSV ne porte que des libellés, mais on part des joueurs assainis :
      // aucune clé de synchronisation ne doit pouvoir se retrouver dans un
      // export, même après une évolution du format.
      matches,
      players: players.map(sanitizePlayer),
      phases,
      rounds,
      unknownPlayerLabel: t("roundClient.unknownPlayer"),
    });

    const csv = buildMatchesCsv(entries, {
      phase: t("matchExport.columns.phase"),
      round: t("matchExport.columns.round"),
      table: t("matchExport.columns.table"),
      status: t("matchExport.columns.status"),
      player: t("matchExport.columns.player"),
      games: t("matchExport.columns.games"),
      winners: t("matchExport.columns.winners"),
      statusLabels: Object.fromEntries(
        MATCH_STATUSES.map((status) => [status, t(`common.matchStatus.${status}`)])
      ) as Record<TournamentMatchStatus, string>,
    });

    const fileName = buildCsvFileName(tournament.name, round?.number);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting tournament matches:", error);
    return NextResponse.json({ error: "Failed to export matches" }, { status: 500 });
  }
}
