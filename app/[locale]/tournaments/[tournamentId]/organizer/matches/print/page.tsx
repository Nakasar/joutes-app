import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next/types";
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
import { buildMatchExportEntries } from "@/lib/tournaments/match-export";
import { PrintShell } from "../../PrintShell";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tournaments");
  return {
    title: t("matchExport.listTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Liste des matchs mise en page pour l'affichage papier. Sans `roundId`, elle
 * couvre tout le tournoi ; avec, elle se limite à la ronde demandée.
 */
export default async function TournamentMatchListPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ roundId?: string }>;
}) {
  const { tournamentId } = await params;
  const { roundId } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!canManageTournament(tournament, session.user.id)) redirect("/tournaments");

  const round = roundId ? await getRoundById(tournamentId, roundId) : null;
  if (roundId && !round) notFound();

  const [matches, players, phases, rounds, t] = await Promise.all([
    round ? listMatchesByRound(tournamentId, round.id) : listMatchesByTournament(tournamentId),
    listPlayers(tournamentId),
    listPhases(tournamentId),
    listRounds(tournamentId),
    getTranslations("Tournaments"),
  ]);

  const entries = buildMatchExportEntries({
    matches,
    players: players.map(sanitizePlayer),
    phases,
    rounds,
    unknownPlayerLabel: t("roundClient.unknownPlayer"),
  });

  const backHref = round
    ? `/tournaments/${tournamentId}/organizer/rounds/${round.id}/matches`
    : `/tournaments/${tournamentId}/organizer/rounds`;

  return (
    <PrintShell
      title={t("matchExport.listTitle")}
      subtitle={
        round
          ? t("matchExport.listSubtitleRound", {
              tournament: tournament.name,
              round: round.number,
              count: entries.length,
            })
          : t("matchExport.listSubtitle", { tournament: tournament.name, count: entries.length })
      }
      backHref={backHref}
    >
      <div className="mb-4 border-b-2 border-black pb-2">
        <p className="text-lg font-bold">{tournament.name}</p>
        <p className="text-sm">
          {round ? t("matchExport.roundLabel", { number: round.number }) : t("matchExport.allRounds")}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm">{t("matchExport.noMatches")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.phase")}</th>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.round")}</th>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.table")}</th>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.players")}</th>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.score")}</th>
              <th className="border border-black p-1 text-left">{t("matchExport.columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.matchId} className="break-inside-avoid">
                <td className="border border-black p-1">{entry.phaseName}</td>
                <td className="border border-black p-1">{entry.roundNumber}</td>
                <td className="border border-black p-1">{entry.tableNumber ?? "—"}</td>
                <td className="border border-black p-1">
                  {entry.players.map((player) => player.label).join(` ${t("common.vs")} `)}
                  {entry.players.length === 1 ? ` (${t("common.bye")})` : ""}
                </td>
                <td className="border border-black p-1 tabular-nums">{entry.score}</td>
                <td className="border border-black p-1">{t(`common.matchStatus.${entry.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}
