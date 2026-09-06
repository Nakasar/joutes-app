import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { auth } from "@/lib/auth";
import { canManageTournament, getTournamentById, listPlayers } from "@/lib/db/tournaments";
import {
  buildFormResponseRows,
  buildFormResponsesCsv,
  buildFormResponsesCsvFileName,
} from "@/lib/tournaments/form-export";
import type { TournamentPlayerStatus } from "@/lib/types/Tournament";

const PLAYER_STATUSES: TournamentPlayerStatus[] = ["registered", "pre-registered", "dropped"];

/**
 * Les réponses au formulaire d'inscription, au format CSV : une ligne par
 * joueur, une colonne par question. Réservé au staff du tournoi : les réponses
 * sont privées, et le fichier porte les noms des joueurs.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tournamentId: string }> }) {
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
    const form = tournament.registrationForm;
    if (!form || form.fields.length === 0) {
      return NextResponse.json({ error: "Ce tournoi n'a pas de formulaire" }, { status: 404 });
    }

    const [players, t] = await Promise.all([
      listPlayers(tournamentId),
      getTranslations("Tournaments"),
    ]);

    const rows = buildFormResponseRows(form, players, {
      decklistCount: (count) => t("form.decklistCount", { count }),
      unrecognized: (count) => t("form.decklistUnrecognized", { count }),
      banned: (count) => t("form.decklistBanned", { count }),
      parseError: t("form.responses.parseError"),
    });

    const csv = buildFormResponsesCsv(form, rows, {
      player: t("matchExport.columns.player"),
      status: t("matchExport.columns.status"),
      answeredAt: t("form.responses.columnAnsweredAt"),
      late: t("form.lateBadge"),
      yes: t("form.responses.yes"),
      no: t("form.responses.no"),
      statusLabels: Object.fromEntries(
        PLAYER_STATUSES.map((status) => [status, t(`common.playerStatus.${status}`)])
      ) as Record<TournamentPlayerStatus, string>,
      formatDate: (date) => DateTime.fromJSDate(date).toFormat("dd/MM/yyyy HH:mm"),
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildFormResponsesCsvFileName(tournament.name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting tournament form responses:", error);
    return NextResponse.json({ error: "Failed to export form responses" }, { status: 500 });
  }
}
