import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import {
  canManageTournament,
  getRoundById,
  getStandings,
  getTournamentById,
  listPhases,
} from "@/lib/db/tournaments";
import { resolveDisplayPhase } from "@/lib/tournaments/current-round";
import { getPreset } from "@/lib/tournaments/game-presets";
import {
  buildStandingsCsv,
  buildStandingsCsvFileName,
  formatTiebreaker,
  gameWinPercentage,
  type StandingsExportEntry,
} from "@/lib/tournaments/standings-export";

/**
 * Classement du tournoi au format CSV. `roundId` exporte le classement figé à
 * l'issue de cette ronde plutôt que le classement courant. Réservé au staff :
 * le CSV porte les noms des joueurs.
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

    const [t, locale] = await Promise.all([getTranslations("Tournaments"), getLocale()]);

    // Une ronde validée porte son classement figé ; sinon on calcule le
    // classement courant. Il est cadré sur la phase affichée par l'écran de
    // classement, sans quoi le CSV « courant » ne correspondrait pas au tableau
    // que l'organisateur a sous les yeux.
    const phases = await listPhases(tournamentId);
    const displayPhase = round
      ? phases.find((phase) => phase.id === round.phaseId)
      : resolveDisplayPhase(phases, tournament.currentPhaseId);

    let rows = round?.standings;
    if (!rows) {
      rows = await getStandings(tournamentId, displayPhase?.id);
    }

    // Colonnes de statistiques du preset de la phase exportée, dans l'ordre
    // dans lequel elles départagent.
    const statColumns = getPreset(displayPhase?.statsPresetKey)?.stats ?? [];

    const entries: StandingsExportEntry[] = rows.map((row, index) => ({
      rank: index + 1,
      name: row.discriminator ? `${row.displayName} #${row.discriminator}` : row.displayName,
      matchPoints: row.matchPoints,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      opponentMatchWin: formatTiebreaker(row.opponentMatchWinPercentage, locale),
      gameWin: formatTiebreaker(gameWinPercentage(row.gamesWon, row.gamesLost), locale),
      status: row.playerStatus === "dropped" ? t("common.playerStatus.dropped") : "",
      stats: statColumns.map((column) => row.stats?.[column.key] ?? 0),
    }));

    const csv = buildStandingsCsv(entries, {
      rank: t("standingsExport.columns.rank"),
      player: t("standingsExport.columns.player"),
      points: t("standingsExport.columns.points"),
      record: t("standingsExport.columns.record"),
      opponentMatchWin: t("standingsExport.columns.opponentMatchWin"),
      gameWin: t("standingsExport.columns.gameWin"),
      status: t("standingsExport.columns.status"),
    }, statColumns.map((column) => t(`matchStats.stats.${column.labelKey}`)));

    const fileName = buildStandingsCsvFileName(tournament.name, round?.number);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting tournament standings:", error);
    return NextResponse.json({ error: "Failed to export standings" }, { status: 500 });
  }
}
