import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MatchExportActions } from "../MatchExportActions.tsx";
import { OrganizerPageHeader } from "../OrganizerPageHeader.tsx";
import { loadOrganizerContext } from "../organizerContext.ts";
import { CreateRoundControl } from "./CreateRoundControl.tsx";
import { RoundsNav, type RoundsNavPhase } from "./RoundsNav.tsx";


export default async function OrganizerRoundsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { phases, rounds, currentRound } = await loadOrganizerContext(tournamentId);

  // Le portail s'ouvre sur la ronde en cours : cette page ne sert qu'à créer la
  // première ronde, quand il n'y en a encore aucune.
  if (currentRound) {
    redirect(`/tournaments/${tournamentId}/organizer/rounds/${currentRound.id}/matches`);
  }

  const t = await getTranslations("Tournaments");

  const navPhases: RoundsNavPhase[] = phases.map((phase) => ({
    phaseId: phase.id,
    phaseName: phase.name,
    rounds: rounds
      .filter((r) => r.phaseId === phase.id)
      .map((r) => ({ id: r.id, number: r.number, validated: !!r.standingsValidatedAt })),
  }));

  return (
    <div className="p-6">
      <OrganizerPageHeader
        title={t("rounds.title")}
        description={t("rounds.emptyDescription")}
        actions={
          <CreateRoundControl
            tournamentId={tournamentId}
            phases={phases.map((p) => ({ id: p.id, name: p.name }))}
          />
        }
      />
      <div className="space-y-4">
        <RoundsNav tournamentId={tournamentId} phases={navPhases} />
        <MatchExportActions tournamentId={tournamentId} />
      </div>
    </div>
  );
}
