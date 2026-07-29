import { getGameById } from "@/lib/db/games";
import { presetsForGameSlug } from "@/lib/tournaments/game-presets";
import { PhasesSection } from "../PhasesSection";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerPhasesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { tournament, phases, rounds, players } = await loadOrganizerContext(tournamentId);

  // Presets de format proposés par le jeu du tournoi (statistiques de match et
  // départages). Un tournoi sans jeu, ou dont le jeu n'en déclare pas, n'a
  // simplement pas la section.
  const game = tournament.gameId ? await getGameById(tournament.gameId) : null;
  const presets = presetsForGameSlug(game?.slug);

  return (
    <div className="p-6">
      <PhasesSection
        tournamentId={tournamentId}
        initialPhases={phases}
        initialCurrentPhaseId={tournament.currentPhaseId}
        presets={presets.map((preset) => ({ key: preset.key, labelKey: preset.labelKey }))}
        rounds={rounds.map((r) => ({
          id: r.id,
          phaseId: r.phaseId,
          number: r.number,
          status: r.status,
          validated: !!r.standingsValidatedAt,
        }))}
        activePlayerCount={players.filter((p) => p.status !== "dropped").length}
      />
    </div>
  );
}
