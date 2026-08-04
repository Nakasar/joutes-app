"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Plus, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import { getPreset, type MatchStatDefinition } from "@/lib/tournaments/game-presets";
import type { TournamentPhaseType, TournamentResultMode, TournamentRoundStanding } from "@/lib/types/Tournament";
import { MatchPlayerName } from "./MatchPlayerName";
import { PlayerNameTag } from "./PlayerNameTag";
import { TablePagination } from "./TablePagination";

type ApiPlayer = { id: string; userId?: string; displayName: string; status: string };
type ApiGame = {
  winnerId?: string | null;
  points?: Record<string, number>;
  // Statistiques secondaires de la partie : joueur → clé de statistique.
  stats?: Record<string, Record<string, number>>;
};
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
  // Preset de statistiques de la phase : donne les colonnes relevées partie
  // par partie (score de bataille, score de destruction…).
  statsPresetKey?: string;
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

function gameSummary(
  game: ApiGame,
  resultMode: TournamentResultMode,
  playerName: (id: string) => string,
  t: ReturnType<typeof useTranslations>
): string {
  if (resultMode === "points" && game.points) {
    const detail = Object.entries(game.points)
      .sort(([, a], [, b]) => b - a)
      .map(([id, pts]) => `${playerName(id)} ${pts}`)
      .join(" · ");
    return game.winnerId ? detail : `${detail} ${t("history.drawSuffix")}`;
  }
  if (game.winnerId) return `${playerName(game.winnerId)} 🏆`;
  return t("history.gameDraw");
}

/**
 * Statistiques relevées sur une partie, joueur par joueur — c'est là que se lit
 * l'historique d'un tournoi de figurines (« Alice : Bataille 82 · Détruits
 * 1 240 »). Un joueur sans aucune statistique saisie est omis plutôt que
 * présenté à zéro : la partie a pu être rapportée avant que la phase ne relève
 * ces scores.
 */
function gameStatLines(
  game: ApiGame,
  stats: MatchStatDefinition[],
  playerIds: string[],
  playerName: (id: string) => string,
  t: ReturnType<typeof useTranslations>
): string[] {
  if (stats.length === 0 || !game.stats) return [];
  return playerIds.flatMap((playerId) => {
    const values = game.stats?.[playerId];
    if (!values) return [];
    const detail = stats
      .filter((stat) => typeof values[stat.key] === "number")
      .map((stat) => `${t(`matchStats.stats.${stat.labelKey}Short`)} ${values[stat.key]}`)
      .join(" · ");
    return detail ? [`${playerName(playerId)} — ${detail}`] : [];
  });
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
  const t = useTranslations("Tournaments");
  const locale = useLocale();
  const router = useRouter();
  const [history, setHistory] = useState<ApiHistory | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Phase ciblée par la création d'une ronde (organisateur).
  const [createPhaseId, setCreatePhaseId] = useState<string>("");
  // Confirmation de suppression de la ronde courante (modale).
  const [deleteRoundOpen, setDeleteRoundOpen] = useState(false);

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
        throw new Error(body.error ?? t("history.loadError"));
      }
      setHistory(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.loadFallbackError"));
    } finally {
      setLoading(false);
    }
  }, [authFetch, tournamentId, t]);

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
    (id: string) => players.find((p) => p.id === id)?.displayName ?? t("history.unknownPlayer"),
    [players, t]
  );

  // Statuts de match affichés dans l'historique (formulations propres à ce
  // contexte pour pending / in-progress).
  const matchStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return t("history.matchStatusPending");
      case "in-progress":
        return t("history.matchStatusAwaitingConfirmation");
      case "completed":
        return t("common.matchStatus.completed");
      case "disputed":
        return t("common.matchStatus.disputed");
      default:
        return status;
    }
  };

  const currentIndex = flatRounds.findIndex((r) => r.round.id === selectedRoundId);
  const current = currentIndex >= 0 ? flatRounds[currentIndex] : null;
  // Statistiques relevées par la phase de la ronde affichée : le preset peut
  // différer d'une phase à l'autre du même tournoi.
  const phaseStats = getPreset(current?.phase.statsPresetKey)?.stats ?? [];

  // La suppression n'est possible que sur la dernière ronde de la phase courante.
  const currentIsLastRound = useMemo(() => {
    if (!current || !history) return false;
    const rounds = history.phases.find((p) => p.phase.id === current.phase.id)?.rounds ?? [];
    return rounds[rounds.length - 1]?.round.id === current.round.id;
  }, [current, history]);

  // Classement figé de la ronde courante, avec son rang réel préservé avant
  // recherche/pagination.
  const rankedStandings = useMemo(
    () => (current?.round.standings ?? []).map((standing, index) => ({ ...standing, rank: index + 1 })),
    [current]
  );
  const standingsSearch = usePaginatedSearch(rankedStandings, (s) => s.displayName, 25);

  // Phase par défaut pour la création : celle de la ronde affichée, sinon la
  // première. N'écrase pas un choix explicite de l'organisateur.
  useEffect(() => {
    if (!createPhaseId && history?.phases.length) {
      setCreatePhaseId(current?.phase.id ?? history.phases[0].phase.id);
    }
  }, [history, current, createPhaseId]);

  const createRound = async () => {
    if (!createPhaseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tournaments/${tournamentId}/phases/${createPhaseId}/rounds`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("history.createRoundError"));
      }
      const round = await res.json();
      // Redirige vers la saisie des résultats de la nouvelle ronde.
      router.push(`/tournaments/${tournamentId}/organizer/rounds/${round.id}/matches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.createRoundError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteRound = async (roundId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("history.deleteRoundError"));
      }
      setDeleteRoundOpen(false);
      setSelectedRoundId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.deleteRoundError"));
    } finally {
      setBusy(false);
    }
  };

  const validate = async (roundId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/standings`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("history.validateError"));
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
      setError(err instanceof Error ? err.message : t("history.validateError"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">{t("history.loadingHistory")}</p>;

  if (error && !history) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          {t("history.retry")}
        </Button>
      </div>
    );
  }

  // Barre de gestion des rondes (organisateur) : création d'une ronde dans une
  // phase. Affichée même sans ronde encore jouée.
  const manageBar =
    canManage && history && history.phases.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <span className="text-sm font-medium">{t("history.manageRounds")}</span>
        <Select value={createPhaseId} onValueChange={setCreatePhaseId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("history.choosePhase")} />
          </SelectTrigger>
          <SelectContent>
            {history.phases.map(({ phase }) => (
              <SelectItem key={phase.id} value={phase.id}>
                {phase.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={createRound} disabled={busy || !createPhaseId}>
          <Plus className="mr-2 h-4 w-4" />
          {t("history.createRound")}
        </Button>
      </div>
    ) : null;

  if (flatRounds.length === 0) {
    return (
      <div className="space-y-4">
        {manageBar}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-muted-foreground">{t("history.noRounds")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {manageBar}

      {/* Navigation horizontale entre rondes, groupées par phase. */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={t("history.prevRound")}
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
                      title={round.standingsValidatedAt ? t("history.standingsValidated") : t("history.standingsNotValidated")}
                      className={cn(
                        "rounded-md border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card hover:bg-accent",
                        !round.standingsValidatedAt && !active && "border-dashed text-muted-foreground"
                      )}
                    >
                      {t("history.roundShort", { number: round.number })}
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
          aria-label={t("history.nextRound")}
          disabled={currentIndex >= flatRounds.length - 1}
          onClick={() => setSelectedRoundId(flatRounds[currentIndex + 1].round.id)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {current && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{t("common.roundN", { number: current.round.number })}</h2>
              <Badge variant="secondary">{t(`common.phaseType.${current.phase.type}`)}</Badge>
              <span className="text-sm text-muted-foreground">
                {current.phase.name} · {t("common.bestOfN", { count: current.phase.bestOf })} ·{" "}
                {current.phase.resultMode === "points" ? t("history.modePoints") : t("history.modeSelection")}
              </span>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/tournaments/${tournamentId}/organizer/rounds/${current.round.id}/matches`}>
                    {t("history.enterResults")}
                  </Link>
                </Button>
                {currentIsLastRound && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => setDeleteRoundOpen(true)}
                    disabled={busy}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("history.deleteRound")}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Récapitulatif des matchs */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("history.matchesTitle")}</h3>
            {current.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("history.noMatches")}</p>
            ) : (
              <ul className="space-y-3">
                {current.matches.map((match) => {
                  const isBye = match.players.length === 1;
                  return (
                    <li key={match.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm font-medium">
                          {match.bracketPosition ? `${match.bracketPosition} — ` : ""}
                          {match.players.map((p, i) => (
                            <span key={p.playerId} className="inline-flex items-center">
                              {i > 0 && !isBye && <span className="mr-1 text-muted-foreground">{t("common.vs")}</span>}
                              <MatchPlayerName
                                isWinner={match.winnerIds.includes(p.playerId)}
                                name={`${playerName(p.playerId)} (${p.score})`}
                              />
                            </span>
                          ))}
                          {isBye ? ` — ${t("common.bye")}` : ""}
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {matchStatusLabel(match.status)}
                        </Badge>
                      </div>
                      {match.games.length > 0 && (
                        <ol className="ml-1 space-y-1 text-xs text-muted-foreground">
                          {match.games.map((game, index) => (
                            <li key={index}>
                              {t("history.gameN", { number: index + 1 })}{" "}
                              {gameSummary(game, current.phase.resultMode, playerName, t)}
                              {gameStatLines(
                                game,
                                phaseStats,
                                match.players.map((p) => p.playerId),
                                playerName,
                                t
                              ).map((line) => (
                                <span key={line} className="block pl-4 font-mono text-[11px]">
                                  {line}
                                </span>
                              ))}
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
                {t("history.standingsTitle")}
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
                    {t("history.recalculate")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => validate(current.round.id)}
                    disabled={busy || current.round.status !== "completed"}
                  >
                    {t("history.validateStandings")}
                  </Button>
                ))}
            </div>

            {!current.round.standings ? (
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? current.round.status === "completed"
                    ? t("history.standingsNotValidatedHint")
                    : t("history.roundMustBeCompleted")
                  : t("history.standingsNotValidatedPlayer")}
              </p>
            ) : (
              <>
                <Input
                  value={standingsSearch.query}
                  onChange={(e) => standingsSearch.setQuery(e.target.value)}
                  placeholder={t("history.searchPlayer")}
                  className="max-w-xs"
                />
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                          {t("history.colPlayer")}
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          {t("history.colPoints")}
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          {t("history.colRecord")}
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          {t("history.colOMW")}
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                          {t("history.colDiff")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {standingsSearch.pageItems.map((standing) => (
                        <tr key={standing.playerId}>
                          <td className="px-3 py-2">{standing.rank}</td>
                          <td className="px-3 py-2 font-medium">
                            <PlayerNameTag
                              name={standing.displayName}
                              discriminator={standing.discriminator}
                            />
                            {standing.playerStatus === "dropped" ? ` ${t("history.dropped")}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{standing.matchPoints}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {standing.wins}/{standing.draws}/{standing.losses}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {((standing.opponentMatchWinPercentage ?? 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                          </td>
                        </tr>
                      ))}
                      {standingsSearch.pageItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                            {t("history.noPlayerMatch")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={standingsSearch.page}
                  totalPages={standingsSearch.totalPages}
                  total={standingsSearch.total}
                  onPage={standingsSearch.setPage}
                />
                {current.round.standingsValidatedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("history.validatedAt", {
                      date: DateTime.fromISO(current.round.standingsValidatedAt)
                        .setLocale(locale)
                        .toFormat("dd/MM/yyyy HH:mm"),
                    })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {current && (
        <ConfirmDialog
          open={deleteRoundOpen}
          onOpenChange={setDeleteRoundOpen}
          title={t("history.deleteRound")}
          description={t("history.deleteRoundConfirm", { number: current.round.number })}
          confirmLabel={t("common.delete")}
          destructive
          busy={busy}
          onConfirm={() => deleteRound(current.round.id)}
        />
      )}
    </div>
  );
}
