import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTournamentById,
  getTournamentRoundHistory,
  isTournamentOrganizer,
  listPlayers,
} from "@/lib/db/tournaments";
import type { TournamentGameResult, TournamentMatch, TournamentPhase } from "@/lib/types/Tournament";

const PHASE_TYPE_LABELS: Record<TournamentPhase["type"], string> = {
  freeform: "Format libre",
  swiss: "Rondes suisses",
  elimination: "Élimination (ré-appariement)",
  bracket: "Arbre d'élimination",
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  pending: "À jouer",
  "in-progress": "En attente de confirmation",
  completed: "Terminé",
  disputed: "Contesté",
};

// Résumé d'une partie du best-of, selon le mode de résultat de la phase.
function gameSummary(
  game: TournamentGameResult,
  phase: TournamentPhase,
  playerName: (id: string) => string
): string {
  if (phase.resultMode === "points" && game.points) {
    const parts = Object.entries(game.points)
      .sort(([, a], [, b]) => b - a)
      .map(([id, pts]) => `${playerName(id)} ${pts}`);
    const detail = parts.join(" · ");
    return game.winnerId ? detail : `${detail} (nulle)`;
  }
  if (game.winnerId) return `${playerName(game.winnerId)} 🏆`;
  return "Partie nulle";
}

export default async function TournamentHistoryPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    notFound();
  }
  if (!isTournamentOrganizer(tournament, session.user.id)) {
    redirect("/tournaments");
  }

  const [players, history] = await Promise.all([
    listPlayers(tournamentId),
    getTournamentRoundHistory(tournamentId),
  ]);

  const playersById = new Map(players.map((p) => [p.id, p]));
  const playerName = (id: string) => playersById.get(id)?.displayName ?? "Inconnu";

  const hasAnyRound = history.some((phase) => phase.rounds.length > 0);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground mt-1">Historique des rondes</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/organizer`}>Retour au portail organisateur</Link>
        </Button>
      </div>

      {!hasAnyRound ? (
        <p className="text-muted-foreground">Aucune ronde jouée pour le moment.</p>
      ) : (
        history.map(({ phase, rounds }) => (
          <section key={phase.id} className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{phase.name}</h2>
              <Badge variant="secondary">{PHASE_TYPE_LABELS[phase.type]}</Badge>
              <span className="text-sm text-muted-foreground">
                best-of-{phase.bestOf} · {phase.resultMode === "points" ? "points" : "sélection"}
              </span>
            </div>

            {rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune ronde dans cette phase.</p>
            ) : (
              rounds.map(({ round, matches, standings }) => (
                <details key={round.id} className="group rounded-lg border bg-card" open>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 select-none">
                    <span className="font-medium">Ronde {round.number}</span>
                    <Badge variant="outline">
                      {round.status === "completed" ? "Terminée" : "En cours"}
                    </Badge>
                  </summary>

                  <div className="border-t px-4 py-4 space-y-6">
                    {/* Récapitulatif des matchs */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Matchs
                      </h3>
                      {matches.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun match.</p>
                      ) : (
                        <ul className="space-y-3">
                          {matches.map((match) => (
                            <MatchRecap
                              key={match.id}
                              match={match}
                              phase={phase}
                              playerName={playerName}
                            />
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Classement à l'issue de la ronde */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Classement à l&apos;issue de la ronde
                      </h3>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="min-w-full divide-y divide-border text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                                #
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                                Joueur
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                                Pts
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                                V/N/D
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                                Diff
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {standings.map((standing, index) => (
                              <tr key={standing.playerId}>
                                <td className="px-3 py-2">{index + 1}</td>
                                <td className="px-3 py-2 font-medium">
                                  {standing.displayName}
                                  {standing.playerStatus === "dropped" ? " (drop)" : ""}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">{standing.matchPoints}</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {standing.wins}/{standing.draws}/{standing.losses}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                                </td>
                              </tr>
                            ))}
                            {standings.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                                  Pas encore de classement
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </details>
              ))
            )}
          </section>
        ))
      )}
    </div>
  );
}

function MatchRecap({
  match,
  phase,
  playerName,
}: {
  match: TournamentMatch;
  phase: TournamentPhase;
  playerName: (id: string) => string;
}) {
  const isBye = match.players.length === 1;

  return (
    <li className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">
          {match.bracketPosition ? `${match.bracketPosition} — ` : ""}
          {match.players
            .map((p) => {
              const label = `${playerName(p.playerId)} (${p.score})`;
              return match.winnerIds.includes(p.playerId) ? `${label} 🏆` : label;
            })
            .join(isBye ? "" : " vs ")}
          {isBye ? " — BYE" : ""}
        </div>
        <Badge variant="outline" className="shrink-0">
          {MATCH_STATUS_LABELS[match.status]}
        </Badge>
      </div>

      {match.games.length > 0 && (
        <ol className="ml-1 space-y-1 text-xs text-muted-foreground">
          {match.games.map((game, index) => (
            <li key={index}>
              Partie {index + 1} : {gameSummary(game, phase, playerName)}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
