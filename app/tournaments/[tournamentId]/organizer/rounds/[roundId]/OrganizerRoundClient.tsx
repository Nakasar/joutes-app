"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, LayoutGrid, List, LockOpen, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MatchStatDefinition } from "@/lib/tournaments/game-presets";
import type {
  TournamentGameResult,
  TournamentMatch,
  TournamentPlayer,
  TournamentResultMode,
  TournamentRound,
} from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../../../MatchGamesEditor";
import { PlayerNameTag } from "../../../PlayerNameTag";
import { buildQuickResults, shortName, type QuickResult } from "../../../quickResults";
import { MatchCard } from "./MatchCard";
import { RoundSidePanel } from "./RoundSidePanel";

// Durée d'une prolongation accordée en un appui, en secondes.
const EXTENSION_STEP = 180;

type RoundPlayer = Pick<TournamentPlayer, "id" | "displayName" | "discriminator" | "status">;
type Filter = "all" | "pending" | "disputed";
type View = "grid" | "table";

type Props = {
  tournamentId: string;
  round: TournamentRound;
  initialMatches: TournamentMatch[];
  players: RoundPlayer[];
  resultMode: TournamentResultMode;
  bestOf: number;
  // Statistiques secondaires du preset de la phase. Vide = aucune.
  stats: MatchStatDefinition[];
  // La phase exige leur saisie : les raccourcis de score, qui n'en portent pas,
  // ne peuvent alors plus rendre un résultat complet.
  requireStats: boolean;
  phaseId: string;
  // La suppression de match n'est possible que dans la dernière ronde.
  isLastRound: boolean;
  // Rouvrir cette ronde annulera aussi les phases démarrées ensuite.
  reopenCascades: boolean;
};

export function OrganizerRoundClient({
  tournamentId,
  round,
  initialMatches,
  players,
  resultMode,
  bestOf,
  stats,
  requireStats,
  phaseId,
  isLastRound,
  reopenCascades,
}: Props) {
  const t = useTranslations("Tournaments");
  const router = useRouter();

  const [matches, setMatches] = useState<TournamentMatch[]>(initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editMatch, setEditMatch] = useState<TournamentMatch | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPlayerIds, setCreatePlayerIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TournamentMatch | null>(null);
  const [deleteRoundOpen, setDeleteRoundOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closeRoundOpen, setCloseRoundOpen] = useState(false);

  const anyBusy = busy || submitting;

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const playerName = useCallback(
    (playerId: string) => playersById.get(playerId)?.displayName ?? t("roundClient.unknownPlayer"),
    [playersById, t]
  );
  const cardPlayers = useMemo(
    () => players.map((p) => ({ id: p.id, name: p.displayName, discriminator: p.discriminator })),
    [players]
  );

  const doneCount = matches.filter((m) => m.status === "completed").length;
  const disputedCount = matches.filter((m) => m.status === "disputed").length;
  const pendingCount = matches.filter((m) => m.status === "pending").length;
  const awaitingCount = matches.filter((m) => m.status === "in-progress").length;
  const total = matches.length;
  const ready = pendingCount === 0 && disputedCount === 0 && awaitingCount === 0 && total > 0;

  const visibleMatches = useMemo(() => {
    const byFilter = matches.filter((m) =>
      filter === "all" ? true : filter === "pending" ? m.status === "pending" : m.status === "disputed"
    );
    const query = search.trim().toLowerCase();
    if (!query) return byFilter;
    return byFilter.filter((m) => {
      const names = m.players.map((p) => playerName(p.playerId).toLowerCase()).join(" ");
      return names.includes(query) || String(m.tableNumber ?? "").includes(query);
    });
  }, [matches, filter, search, playerName]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`);
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches ?? []);
    }
  }, [tournamentId, round.id]);

  // Toutes les mutations de match passent par ici : même gestion d'erreur, même
  // rafraîchissement, et une seule opération à la fois pour éviter que deux
  // saisies concurrentes se marchent dessus.
  const mutateMatch = useCallback(
    async (matchId: string, body: Record<string, unknown>, errorKey: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? t(errorKey));
        }
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : t(errorKey));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [tournamentId, refresh, t]
  );

  const applyQuickResult = async (match: TournamentMatch, result: QuickResult) => {
    const ok = await mutateMatch(
      match.id,
      { action: "report", games: result.games },
      "roundClient.reportError"
    );
    if (ok) setOpenMatchId(null);
  };

  const submitDetailed = (match: TournamentMatch, games: TournamentGameResult[]) => {
    if (games.length === 0) {
      setError(t("roundClient.reportAtLeastOneGame"));
      return;
    }
    setSubmitting(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "report", games }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? t("roundClient.reportError"));
        }
        await refresh();
        setEditMatch(null);
        setOpenMatchId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.reportError"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const setTable = (match: TournamentMatch, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    if (next === (match.tableNumber ?? null)) return;
    mutateMatch(match.id, { action: "set-table", tableNumber: next }, "roundClient.tableError");
  };

  const deleteMatch = async (match: TournamentMatch) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("roundClient.deleteMatchError"));
      }
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roundClient.deleteMatchError"));
    } finally {
      setBusy(false);
    }
  };

  const roundAction = async (
    body: Record<string, unknown> | null,
    method: "PATCH" | "DELETE",
    errorKey: string,
    onDone: () => void
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t(errorKey));
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(errorKey));
      setBusy(false);
    }
  };

  /**
   * Clôture la ronde : fige son classement puis génère la ronde suivante de la
   * phase, et bascule dessus. Les deux gestes sont enchaînés parce qu'ils n'ont
   * de sens qu'ensemble — un classement figé sans ronde suivante laisserait le
   * tournoi en suspens.
   */
  const closeRound = async () => {
    setBusy(true);
    setError(null);
    try {
      const validateRes = await fetch(
        `/api/tournaments/${tournamentId}/rounds/${round.id}/standings`,
        { method: "POST" }
      );
      if (!validateRes.ok) {
        const data = await validateRes.json().catch(() => ({}));
        throw new Error(data.error ?? t("roundStandings.validateError"));
      }

      const createRes = await fetch(`/api/tournaments/${tournamentId}/phases/${phaseId}/rounds`, {
        method: "POST",
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        // Le classement est déjà figé : on le dit, pour que l'organisateur
        // sache que seule la création de la ronde a échoué.
        throw new Error(data.error ?? t("roundClient.closeCreateError"));
      }
      const next = await createRes.json();
      setCloseRoundOpen(false);
      router.push(`/tournaments/${tournamentId}/organizer/rounds/${next.id}/matches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roundClient.closeError"));
      setBusy(false);
      setCloseRoundOpen(false);
    }
  };

  const createMatch = async () => {
    if (createPlayerIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: createPlayerIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("roundClient.createMatchError"));
      }
      await refresh();
      setCreateOpen(false);
      setCreatePlayerIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roundClient.createMatchError"));
    } finally {
      setBusy(false);
    }
  };

  const pairedIds = useMemo(
    () => new Set(matches.flatMap((m) => m.players.map((p) => p.playerId))),
    [matches]
  );
  const availableOptions = useMemo(
    () =>
      players
        .filter(
          (p) => p.status === "registered" && !pairedIds.has(p.id) && !createPlayerIds.includes(p.id)
        )
        .map((p) => ({
          value: p.id,
          label: p.discriminator ? `${p.displayName} #${p.discriminator}` : p.displayName,
        })),
    [players, pairedIds, createPlayerIds]
  );

  const matchLabel = (match: TournamentMatch) =>
    `${match.bracketPosition ? `${match.bracketPosition} — ` : ""}${match.players
      .map((p) => playerName(p.playerId))
      .join(` ${t("common.vs")} `)}${match.players.length === 1 ? ` (${t("common.bye")})` : ""}`;

  // Part des tables rendues et en litige, pour la jauge de progression.
  const donePercent = total > 0 ? (doneCount / total) * 100 : 0;
  const disputedPercent = total > 0 ? (disputedCount / total) * 100 : 0;

  // Les raccourcis ne savent pas porter de statistiques : dès que la phase les
  // exige, la saisie détaillée devient le seul chemin complet.
  const quickResultsFor = (match: TournamentMatch) =>
    resultMode === "selection" && !(requireStats && stats.length > 0)
      ? buildQuickResults(bestOf, match.players.map((p) => p.playerId))
      : [];

  const filterChips: { key: Filter; label: string; tone?: "alert" }[] = [
    { key: "all", label: t("roundClient.filterAll") },
    { key: "pending", label: t("roundClient.filterPending", { count: pendingCount }) },
    ...(disputedCount > 0
      ? [{ key: "disputed" as const, label: t("roundClient.filterDisputed", { count: disputedCount }), tone: "alert" as const }]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      <div className="min-w-0 flex-1 p-6 pb-28">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[22px] font-bold tabular-nums">
                {doneCount}
                <span className="font-medium text-muted-foreground">/{total}</span>
              </span>
              <span className="text-sm text-muted-foreground">{t("roundClient.resultsIn")}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  aria-pressed={filter === chip.key}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    filter === chip.key
                      ? "border-transparent bg-foreground text-background"
                      : chip.tone === "alert"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "bg-card hover:bg-accent"
                  )}
                >
                  {chip.label}
                </button>
              ))}

              <div className="ml-1 flex gap-0.5 rounded-lg bg-muted p-[3px]">
                {(
                  [
                    { key: "grid" as const, label: t("roundClient.viewGrid"), Icon: LayoutGrid },
                    { key: "table" as const, label: t("roundClient.viewTable"), Icon: List },
                  ]
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      view === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-600" style={{ width: `${donePercent}%` }} />
            <div className="bg-destructive" style={{ width: `${disputedPercent}%` }} />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("roundClient.searchPlayer")}
            className="max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} disabled={anyBusy}>
              <Plus className="size-4" />
              {t("roundClient.createMatch")}
            </Button>
            {round.status === "completed" && isLastRound && (
              <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)} disabled={anyBusy}>
                <LockOpen className="size-4" />
                {t("roundClient.reopenRound")}
              </Button>
            )}
            {isLastRound && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteRoundOpen(true)}
                disabled={anyBusy}
              >
                <Trash2 className="size-4" />
                {t("roundClient.deleteRound")}
              </Button>
            )}
          </div>
        </div>

        {matches.length === 0 ? (
          <p className="text-muted-foreground">{t("roundClient.noMatches")}</p>
        ) : visibleMatches.length === 0 ? (
          <p className="text-muted-foreground">{t("roundClient.noSearchResults")}</p>
        ) : view === "grid" ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {visibleMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                players={cardPlayers}
                quickResults={quickResultsFor(match)}
                open={openMatchId === match.id}
                busy={anyBusy}
                onToggle={() => setOpenMatchId((id) => (id === match.id ? null : match.id))}
                onQuickResult={(result) => applyQuickResult(match, result)}
                onDetailedEntry={() => setEditMatch(match)}
                onExtend={() =>
                  mutateMatch(
                    match.id,
                    { action: "extend", seconds: EXTENSION_STEP },
                    "roundClient.extendError"
                  )
                }
                onClearExtension={() =>
                  mutateMatch(match.id, { action: "extend", seconds: 0 }, "roundClient.extendError")
                }
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="w-16 px-3 py-2.5 text-left font-semibold">
                    {t("roundClient.headerTable")}
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("roundClient.headerMatch")}</th>
                  <th className="w-20 px-3 py-2.5 text-center font-semibold">
                    {t("roundClient.headerResult")}
                  </th>
                  <th className="w-28 px-3 py-2.5 text-left font-semibold">
                    {t("roundClient.headerStatus")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    {t("roundClient.quickEntryTitle")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleMatches.map((match) => {
                  const isBye = match.players.length === 1;
                  const done = match.status === "completed";
                  const disputed = match.status === "disputed";
                  const quick = quickResultsFor(match);
                  const extensionMinutes = Math.round((match.extensionSeconds ?? 0) / 60);
                  return (
                    <tr
                      key={match.id}
                      className={cn("border-b last:border-b-0", disputed && "bg-destructive/5")}
                    >
                      <td className="px-3 py-2">
                        {isBye ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Input
                            key={`${match.id}-${match.tableNumber ?? ""}`}
                            type="number"
                            min={0}
                            max={9999}
                            className="h-8 w-16 font-mono"
                            defaultValue={match.tableNumber ?? ""}
                            placeholder="—"
                            onBlur={(e) => setTable(match, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            disabled={anyBusy}
                            aria-label={t("roundClient.tableAria", { match: matchLabel(match) })}
                          />
                        )}
                      </td>
                      <td className="max-w-0 truncate px-3 py-2">
                        {match.players.map((p, i) => {
                          const player = playersById.get(p.playerId);
                          const isWinner = match.winnerIds.includes(p.playerId);
                          return (
                            <span key={p.playerId}>
                              {i > 0 && (
                                <span className="text-muted-foreground">{` ${t("common.vs")} `}</span>
                              )}
                              <span className={isWinner ? "font-bold" : undefined}>
                                <PlayerNameTag
                                  name={player?.displayName ?? t("roundClient.unknownPlayer")}
                                  discriminator={player?.discriminator}
                                />
                              </span>
                            </span>
                          );
                        })}
                        {isBye && <span className="text-muted-foreground">{` (${t("common.bye")})`}</span>}
                      </td>
                      <td className="px-3 py-2 text-center font-mono font-semibold">
                        {done ? match.players.map((p) => p.score).join("–") : <span className="text-muted-foreground/50">–</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            disputed
                              ? "text-destructive"
                              : done
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                          )}
                        >
                          {disputed
                            ? t("roundClient.cardStatus.disputed")
                            : done
                              ? t("roundClient.cardStatus.completedShort")
                              : match.status === "in-progress"
                                ? t("roundClient.cardStatus.awaitingConfirmation")
                                : t("roundClient.cardStatus.pending")}
                        </span>
                        {extensionMinutes > 0 && (
                          <span className="block text-[11px] text-sky-700 dark:text-sky-400">
                            {t("roundClient.extensionShort", { minutes: extensionMinutes })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {isBye ? (
                            <span className="text-xs text-muted-foreground">{t("roundClient.autoWin")}</span>
                          ) : (
                            <>
                              {quick.map((result) => {
                                const winnerId =
                                  result.winnerIndex === null
                                    ? null
                                    : match.players[result.winnerIndex]?.playerId;
                                const winner = winnerId ? playersById.get(winnerId) : undefined;
                                return (
                                  <Button
                                    key={result.key}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={anyBusy}
                                    onClick={() => applyQuickResult(match, result)}
                                  >
                                    {winner ? `${shortName(winner.displayName)} ` : ""}
                                    <span className="font-mono">
                                      {result.winnerIndex === null
                                        ? t("gamesEditor.draw")
                                        : `${result.scores[0]}–${result.scores[1]}`}
                                    </span>
                                  </Button>
                                );
                              })}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                title={t("roundClient.extendTitle")}
                                disabled={anyBusy}
                                onClick={() =>
                                  mutateMatch(
                                    match.id,
                                    { action: "extend", seconds: EXTENSION_STEP },
                                    "roundClient.extendError"
                                  )
                                }
                              >
                                {t("roundClient.extendShort")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                disabled={anyBusy}
                                onClick={() => setEditMatch(match)}
                              >
                                {t("roundClient.detailedEntry")}
                              </Button>
                              {isLastRound && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-destructive hover:text-destructive"
                                  disabled={anyBusy}
                                  onClick={() => setPendingDelete(match)}
                                  aria-label={t("roundClient.deleteMatchAria", {
                                    match: matchLabel(match),
                                  })}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RoundSidePanel
        tournamentId={tournamentId}
        matches={matches}
        busy={anyBusy}
        onShowDisputes={() => setFilter("disputed")}
        onShowPending={() => setFilter("pending")}
        onClearExtension={(match) =>
          mutateMatch(match.id, { action: "extend", seconds: 0 }, "roundClient.extendError")
        }
      />

      {/* Barre de clôture : rappelle ce qui reste à faire et enchaîne sur la
          ronde suivante quand tout est rendu. */}
      <div
        data-print-hidden
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-6 py-3 backdrop-blur xl:right-[300px]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-5.5 items-center justify-center rounded-full text-xs font-bold text-white",
                ready ? "bg-emerald-600" : "bg-amber-500"
              )}
            >
              {ready ? "✓" : "!"}
            </span>
            <div>
              <p className="text-sm font-semibold">
                {ready ? t("roundClient.readyTitle") : t("roundClient.notReadyTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {ready
                  ? t("roundClient.readySubtitle")
                  : t("roundClient.notReadySubtitle", {
                      pending: pendingCount + awaitingCount,
                      disputed: disputedCount,
                    })}
              </p>
            </div>
          </div>
          <Button onClick={() => setCloseRoundOpen(true)} disabled={anyBusy || !ready}>
            <Check className="size-4" />
            {t("roundClient.closeAndStartNext", { number: round.number + 1 })}
          </Button>
        </div>
      </div>

      {/* Modale : saisie détaillée partie par partie */}
      <Dialog open={editMatch !== null} onOpenChange={(open) => !open && setEditMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("roundClient.editScore")}</DialogTitle>
          </DialogHeader>
          {editMatch && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{matchLabel(editMatch)}</p>
              <MatchGamesEditor
                key={`${editMatch.id}-${editMatch.updatedAt ?? ""}`}
                matchId={editMatch.id}
                matchPlayerIds={editMatch.players.map((p) => p.playerId)}
                playerName={playerName}
                resultMode={resultMode}
                bestOf={bestOf}
                stats={stats}
                requireStats={requireStats}
                submitting={submitting}
                submitLabel={t("common.save")}
                onSubmit={(games) => submitDetailed(editMatch, games)}
              />

              {/* Match non joué : forfait d'un côté, ou double défaite. Le
                  vainqueur d'un forfait est crédité comme s'il avait eu un BYE. */}
              {editMatch.players.length === 2 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">{t("roundClient.forfeitTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("roundClient.forfeitHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {editMatch.players.map((p) => (
                      <Button
                        key={p.playerId}
                        variant="outline"
                        size="sm"
                        disabled={anyBusy}
                        onClick={async () => {
                          const ok = await mutateMatch(
                            editMatch.id,
                            { action: "forfeit", winnerId: p.playerId },
                            "roundClient.forfeitError"
                          );
                          if (ok) setEditMatch(null);
                        }}
                      >
                        {t("roundClient.forfeitWin", { name: playerName(p.playerId) })}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={anyBusy}
                      onClick={async () => {
                        const ok = await mutateMatch(
                          editMatch.id,
                          { action: "forfeit", winnerId: null },
                          "roundClient.forfeitError"
                        );
                        if (ok) setEditMatch(null);
                      }}
                    >
                      {t("roundClient.forfeitDoubleLoss")}
                    </Button>
                  </div>
                </div>
              )}

              {editMatch.status !== "pending" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={anyBusy}
                  onClick={async () => {
                    const ok = await mutateMatch(
                      editMatch.id,
                      { action: "clear" },
                      "roundClient.clearError"
                    );
                    if (ok) setEditMatch(null);
                  }}
                >
                  {t("roundClient.clearResultConfirm")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modale : créer un match */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreatePlayerIds([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("roundClient.createMatch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Combobox
                options={availableOptions}
                value=""
                onChange={(id) => {
                  if (id) setCreatePlayerIds((current) => [...current, id]);
                }}
                placeholder={t("roundClient.addPlayer")}
                searchPlaceholder={t("roundClient.searchPlayerCombobox")}
                emptyMessage={t("roundClient.noPlayerAvailable")}
                disabled={anyBusy}
              />
              <p className="text-xs text-muted-foreground">{t("roundClient.createMatchHint")}</p>
            </div>

            {createPlayerIds.length > 0 && (
              <ul className="space-y-1">
                {createPlayerIds.map((id) => (
                  <li
                    key={id}
                    className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span>{playerName(id)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0"
                      onClick={() => setCreatePlayerIds((c) => c.filter((pid) => pid !== id))}
                      aria-label={t("roundClient.removePlayerAria", { name: playerName(id) })}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={anyBusy}>
                {t("common.cancel")}
              </Button>
              <Button onClick={createMatch} disabled={anyBusy || createPlayerIds.length === 0}>
                {t("roundClient.createMatchConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeRoundOpen}
        onOpenChange={(open) => !open && setCloseRoundOpen(false)}
        title={t("roundClient.closeAndStartNext", { number: round.number + 1 })}
        description={t("roundClient.closeDescription", { number: round.number })}
        confirmLabel={t("roundClient.closeConfirm")}
        busy={anyBusy}
        onConfirm={closeRound}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("roundClient.deleteMatchTitle")}
        description={
          pendingDelete
            ? t("roundClient.deleteMatchDescription", { match: matchLabel(pendingDelete) })
            : undefined
        }
        confirmLabel={t("common.delete")}
        destructive
        busy={anyBusy}
        onConfirm={() => pendingDelete && deleteMatch(pendingDelete)}
      />

      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={(open) => !open && setReopenOpen(false)}
        title={t("roundClient.reopenRound")}
        description={
          reopenCascades
            ? t("roundClient.reopenCascadeDescription", { number: round.number })
            : t("roundClient.reopenDescription", { number: round.number })
        }
        confirmLabel={t("roundClient.reopenConfirm")}
        destructive={reopenCascades}
        busy={anyBusy}
        onConfirm={() =>
          roundAction({ action: "reopen" }, "PATCH", "roundClient.reopenError", () => {
            setReopenOpen(false);
            router.refresh();
          })
        }
      />

      <ConfirmDialog
        open={deleteRoundOpen}
        onOpenChange={(open) => !open && setDeleteRoundOpen(false)}
        title={t("roundClient.deleteRoundTitle")}
        description={t("roundClient.deleteRoundDescription", { number: round.number })}
        confirmLabel={t("common.delete")}
        destructive
        busy={anyBusy}
        onConfirm={() =>
          roundAction(null, "DELETE", "roundClient.deleteRoundError", () =>
            router.push(`/tournaments/${tournamentId}/organizer/rounds`)
          )
        }
      />
    </div>
  );
}
