import { getTranslations } from "next-intl/server";
import type { Metadata } from "next/types";
import { buildMatchExportEntries } from "@/lib/tournaments/match-export";
import { loadOrganizerRoundContext } from "../../roundContext";
import { PrintShell } from "../../../../PrintShell";
import { MatchSheet } from "./MatchSheet";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tournaments");
  return {
    title: t("matchExport.sheetsTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Feuilles de match d'une ronde, prêtes à imprimer (une feuille par match, deux
 * par page A4). Les BYE en sont exclus : sans adversaire, il n'y a rien à
 * remplir ni à faire signer.
 */
export default async function RoundMatchSheetsPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { tournament, round, phase, matches, players } = await loadOrganizerRoundContext(
    tournamentId,
    roundId
  );
  const t = await getTranslations("Tournaments");

  const entries = buildMatchExportEntries({
    matches,
    players,
    phases: [phase],
    rounds: [round],
    unknownPlayerLabel: t("roundClient.unknownPlayer"),
  }).filter((entry) => entry.players.length > 1);

  return (
    <PrintShell
      title={t("matchExport.sheetsTitle")}
      subtitle={t("matchExport.sheetsSubtitle", {
        tournament: tournament.name,
        round: round.number,
        count: entries.length,
      })}
      backHref={`/tournaments/${tournamentId}/organizer/rounds/${roundId}/matches`}
    >
      {entries.length === 0 ? (
        <p className="text-sm">{t("matchExport.noPrintableMatches")}</p>
      ) : (
        entries.map((entry) => (
          <MatchSheet
            key={entry.matchId}
            entry={entry}
            tournamentName={tournament.name}
            phaseName={phase.name}
            roundNumber={round.number}
            bestOf={phase.bestOf}
            resultMode={phase.resultMode}
          />
        ))
      )}
    </PrintShell>
  );
}
