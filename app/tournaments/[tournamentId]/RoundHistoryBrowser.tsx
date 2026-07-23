"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TournamentPhaseType, TournamentResultMode, TournamentRoundStanding } from "@/lib/types/Tournament";

const PHASE_TYPE_LABELS: Record<TournamentPhaseType, string> = {
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

type ApiPlayer = { id: string; userId?: string; displayName: string; status: string };
type ApiGame = { winnerId?: string | null; points?: Record<string, number> };
type ApiMatchPlayer = { playerId: string; score: number };
type ApiMatch = {
  id: string;
  players: ApiMatchPlayer[];
  games: ApiGame[];
  winnerIds: string[];
  bracketPosition?: string;
  status: string;
};
type ApiPhase = {
  id: string;
  name: string;
  type: TournamentPhaseType;
  bestOf: number;
  resultMode: TournamentResultMode;
};
type ApiRound = {
  id: string;
  number: number;
  status: string;
  standings?: TournamentRoundStanding[];
  standingsValidatedAt?: string;
};
type ApiRoundEntry = { round: ApiRound; matches: ApiMatch[] };
type ApiPhaseHistory = { phase: ApiPhase; rounds: ApiRoundEntry[] };
type ApiHistory = { phases: ApiPhaseHistory[]; players: ApiPlayer[] };

// Une ronde à plat avec le contexte de sa phase, pour la navigation et le rendu.
type FlatRound = { phase: ApiPhase; round: ApiRound; matches: ApiMatch[] };

function gameSummary(game: ApiGame, resultMode: TournamentResultMode, playerName: (id: string) => string): string {
  if (resultMode === "points" && game.points) {
    const detail = Object.entries(game.points)
      .sort(([, a], [, b]) => b - a)
      .map(([id, pts]) => `${playerName(id)} ${pts}`)
      .join(" · ");
    return game.winnerId ? detail : `${detail} (nulle)`;
  }
  if (game.winnerId) return `${playerName(game.winnerId)} 🏆`;
  return "Partie nulle";
}

type Props = {
  tournamentId: string;
  // L'organisateur peut valider / recalculer le classement figé d'une ronde.
  canManage: boolean;
  // Clé de synchronisation d'un joueur invité (portail joueur) ; absente pour
  // un accès par session.
  syncKey?: string | null;
};

export function RoundHistoryBrowser({ tournamentId, canManage, syncKey }: Props) {
  const [history, setHistory] = useState<ApiHistory | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(syncKey ? { Authorization: `Bearer ${syncKey}` } : {}),
        },
      }),
    [syncKey]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tournaments/${tournamentId}/history`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Impossible de charger l'historique");
      }
      setHistory(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [authFetch, tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Liste ordonnée des rondes à plat (phases ordonnées, rondes par numéro).
  const flatRounds = useMemo<FlatRound[]>(() => {
    if (!history) return [];
    return history.phases.flatMap(({ phase, rounds }) =>
      rounds.map(({ round, matches }) => ({ phase, round, matches }))
    );
  }, [history]);

  // Sélection par défaut : la dernière ronde dont le classement est validé,
  // sinon la dernière ronde tout court.
  useEffect(() => {
    if (selectedRoundId || flatRounds.length === 0) return;
    const lastValidated = [...flatRounds].reverse().find((r) => r.round.standingsValidatedAt);
    setSelectedRoundId((lastValidated ?? flatRounds[flatRounds.length - 1]).round.id);
  }, [flatRounds, selectedRoundId]);

  const players = history?.players ?? [];
  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.displayName ?? "Inconnu",
    [players]
  );

  const currentIndex = flatRounds.findIndex((r) => r.round.id === selectedRoundId);
  const current = currentIndex >= 0 ? flatRounds[currentIndex] : null;

  const validate = async (roundId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/standings`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la validation du classement");
      }
      const round = await res.json();
      // Met à jour la ronde concernée dans l'historique local.
      setHistory((prev) =>
        prev
          ? {
              ...prev,
              phases: prev.phases.map((ph) => ({
                ...ph,
                rounds: ph.rounds.map((entry) =>
                  entry.round.id === roundId
                    ? {
                        ...entry,
                        round: {
                          ...entry.round,
                          standings: round.standings ?? [],
                          standingsValidatedAt: round.standingsValidatedAt,
                        },
                      }
                    : entry
                ),
              })),
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la validation du classement");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Chargement de l&apos;historique...</p>;

  if (error && !history) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (flatRounds.length === 0) {
    return <p className="text-muted-foreground">Aucune ronde jouée pour le moment.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Navigation horizontale entre rondes, groupées par phase. */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Ronde précédente"
          disabled={currentIndex <= 0}
          onClick={() => setSelectedRoundId(flatRounds[currentIndex - 1].round.id)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex flex-1 items-center gap-4 overflow-x-auto pb-1">
          {history?.phases.map(({ phase, rounds }) =>
            rounds.length === 0 ? null : (
              <div key={phase.id} className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {phase.name}
                </span>
                {rounds.map(({ round }) => {
                  const active = round.id === selectedRoundId;
                  return (
                    <button
                      key={round.id}
                      type="button"
                      onClick={() => setSelectedRoundId(round.id)}
                      title={round.standingsValidatedAt ? "Classement validé" : "Classement non validé"}
                      className={cn(
                        "rounded-md border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card hover:bg-accent",
                        !round.standingsValidatedAt && !active && "border-dashed text-muted-foreground"
                      )}
                    >
                      R{round.number}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Ronde suivante"
          disabled={currentIndex >= flatRounds.length - 1}
          onClick={() => setSelectedRoundId(flatRounds[currentIndex + 1].round.id)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {current && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">Ronde {current.round.number}</h2>
            <Badge variant="secondary">{PHASE_TYPE_LABELS[current.phase.type]}</Badge>
            <span className="text-sm text-muted-foreground">
              {current.phase.name} · best-of-{current.phase.bestOf} ·{" "}
              {current.phase.resultMode === "points" ? "points" : "sélection"}
            </span>
          </div>

          {/* Récapitulatif des matchs */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Matchs</h3>
            {current.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun match.</p>
            ) : (
              <ul className="space-y-3">
                {current.matches.map((match) => {
                  const isBye = match.players.length === 1;
                  return (
                    <li key={match.id} className="space-y-2 rounded-lg border p-3">
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
                          {MATCH_STATUS_LABELS[match.status] ?? match.status}
                        </Badge>
                      </div>
                      {match.games.length > 0 && (
                        <ol className="ml-1 space-y-1 text-xs text-muted-foreground">
                          {match.games.map((game, index) => (
                            <li key={index}>
                              Partie {index + 1} :{" "}
                              {gameSummary(game, current.phase.resultMode, playerName)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Classement figé à l'issue de la ronde */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Classement à l&apos;issue de la ronde
              </h3>
              {canManage &&
                (current.round.standings ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => validate(current.round.id)}
                    disabled={busy || current.round.status !== "completed"}
                  >
                    <RotateCw className="mr-2 h-4 w-4" />
                    Recalculer
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => validate(current.round.id)}
                    disabled={busy || current.round.status !== "completed"}
                  >
                    Valider le classement
                  </Button>
                ))}
            </div>

            {!current.round.standings ? (
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? current.round.status === "completed"
                    ? "Classement non validé. Validez la ronde pour figer le classement."
                    : "La ronde doit être terminée pour valider son classement."
                  : "Le classement de cette ronde n'a pas encore été validé."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                          Joueur
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          Pts
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          V/N/D
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          Diff
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {current.round.standings.map((standing, index) => (
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
                    </tbody>
                  </table>
                </div>
                {current.round.standingsValidatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Validé le{" "}
                    {DateTime.fromISO(current.round.standingsValidatedAt)
                      .setLocale("fr")
                      .toFormat("dd/MM/yyyy HH:mm")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
