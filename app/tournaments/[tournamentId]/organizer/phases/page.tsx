import { getGameById } from "@/lib/db/games";
import { presetOptionsForGame, resolveGameTournamentDefaults } from "@/lib/tournaments/game-defaults";
import { PhasesSection } from "../PhasesSection";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerPhasesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { tournament, phases, rounds, players } = await loadOrganizerContext(tournamentId);

  // Réglages de tournoi du jeu : les presets qu'il propose (statistiques de
  // match et départages) et ce dont part une nouvelle phase, tel que
  // l'administration l'a réglé. Un tournoi sans jeu retombe sur les défauts de
  // la plateforme, et n'a simplement pas la section des statistiques.
  const game = tournament.gameId ? await getGameById(tournament.gameId) : null;
  const presets = presetOptionsForGame(game?.slug, game?.tournamentDefaults);
  const gameDefaults = resolveGameTournamentDefaults(game?.slug, game?.tournamentDefaults);

  return (
    <div className="p-6">
      <PhasesSection
        tournamentId={tournamentId}
        initialPhases={phases}
        initialCurrentPhaseId={tournament.currentPhaseId}
        presets={presets.map((preset) => ({
          key: preset.key,
          labelKey: preset.labelKey,
          requireStats: preset.defaults.requireStats,
          stats: preset.stats.map((stat) => ({ key: stat.key, labelKey: stat.labelKey })),
          tiebreakers: preset.tiebreakers,
        }))}
        gameDefaults={{
          statsPresetKey: gameDefaults.statsPresetKey,
          tiebreakers: gameDefaults.tiebreakers,
          fixedScoring: gameDefaults.fixedScoring,
          swissPairing: gameDefaults.swissPairing,
          bestOf: gameDefaults.bestOf,
          resultMode: gameDefaults.resultMode,
          requireMatchStats: gameDefaults.requireMatchStats,
          scenarios: gameDefaults.scenarios,
        }}
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
