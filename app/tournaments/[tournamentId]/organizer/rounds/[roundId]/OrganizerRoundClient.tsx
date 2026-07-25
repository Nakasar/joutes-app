"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Eraser, LockOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import type {
  TournamentGameResult,
  TournamentMatch,
  TournamentPlayer,
  TournamentResultMode,
  TournamentRound,
} from "@/lib/types/Tournament";
import { MatchGamesEditor } from "../../../MatchGamesEditor";
import { MatchPlayerName } from "../../../MatchPlayerName";
import { TablePagination } from "../../../TablePagination";

const MATCH_STATUS_KEYS: Record<string, string> = {
  pending: "roundClient.matchStatus.pending",
  "in-progress": "roundClient.matchStatus.inProgress",
  completed: "roundClient.matchStatus.completed",
  disputed: "roundClient.matchStatus.disputed",
};

type RoundPlayer = Pick<TournamentPlayer, "id" | "displayName" | "discriminator" | "status">;

type Props = {
  tournamentId: string;
  round: TournamentRound;
  initialMatches: TournamentMatch[];
  players: RoundPlayer[];
  resultMode: TournamentResultMode;
  bestOf: number;
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
  isLastRound,
  reopenCascades,
}: Props) {
  const t = useTranslations("Tournaments");
  const [matches, setMatches] = useState<TournamentMatch[]>(initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Match dont le score est en cours d'édition (modale).
  const [editMatch, setEditMatch] = useState<TournamentMatch | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Création de match (modale) : joueurs sélectionnés et valeur du combobox.
  const [createOpen, setCreateOpen] = useState(false);
  const [createPlayerIds, setCreatePlayerIds] = useState<string[]>([]);

  // Match en attente de confirmation de suppression (modale).
  const [pendingDelete, setPendingDelete] = useState<TournamentMatch | null>(null);
  // Résultat rapporté en attente de confirmation de suppression (modale).
  const [pendingClear, setPendingClear] = useState<TournamentMatch | null>(null);
  // Confirmation de suppression de la ronde entière (modale).
  const [deleteRoundOpen, setDeleteRoundOpen] = useState(false);
  // Confirmation de réouverture de la ronde terminée (modale).
  const [reopenOpen, setReopenOpen] = useState(false);
  const router = useRouter();

  // Une opération est en cours (suppression/création ou envoi d'un score) :
  // sert à désactiver toutes les actions et éviter des requêtes concurrentes.
  const anyBusy = busy || submitting;

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const playerName = useCallback(
    (playerId: string) => playersById.get(playerId)?.displayName ?? t("roundClient.unknownPlayer"),
    [playersById, t]
  );

  const search = usePaginatedSearch(
    matches,
    (m) => m.players.map((p) => playerName(p.playerId)).join(" "),
    15
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`);
    if (res.ok) {
      const data = await res.json();
      setMatches(data.matches ?? []);
    }
  }, [tournamentId, round.id]);

  const submitReport = (match: TournamentMatch, games: TournamentGameResult[]) => {
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
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.reportError"));
        }
        await refresh();
        setEditMatch(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.reportError"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  // Valide manuellement un score en attente de confirmation.
  const confirmMatch = (match: TournamentMatch) => {
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.confirmError"));
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.confirmError"));
      } finally {
        setBusy(false);
      }
    })();
  };

  // Supprime le résultat rapporté d'un match (le remet « à jouer »).
  const clearMatch = (match: TournamentMatch) => {
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.clearError"));
        }
        setPendingClear(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.clearError"));
      } finally {
        setBusy(false);
      }
    })();
  };

  const deleteMatch = (match: TournamentMatch) => {
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matches/${match.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.deleteMatchError"));
        }
        setPendingDelete(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.deleteMatchError"));
      } finally {
        setBusy(false);
      }
    })();
  };

  const deleteRound = () => {
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.deleteRoundError"));
        }
        router.push(`/tournaments/${tournamentId}/organizer/rounds`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.deleteRoundError"));
        setBusy(false);
        setDeleteRoundOpen(false);
      }
    })();
  };

  // Rouvre la ronde terminée (la repasse « en cours », ronde courante).
  const reopenRound = () => {
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.reopenError"));
        }
        setReopenOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.reopenError"));
      } finally {
        setBusy(false);
      }
    })();
  };

  const createMatch = () => {
    if (createPlayerIds.length === 0) return;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}/matches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ players: createPlayerIds }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? t("roundClient.createMatchError"));
        }
        await refresh();
        setCreateOpen(false);
        setCreatePlayerIds([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("roundClient.createMatchError"));
      } finally {
        setBusy(false);
      }
    })();
  };

  // Joueurs déjà appariés dans cette ronde (dans un match existant).
  const pairedIds = useMemo(
    () => new Set(matches.flatMap((m) => m.players.map((p) => p.playerId))),
    [matches]
  );
  // Options du combobox : joueurs actifs non appariés et non déjà sélectionnés.
  const availableOptions = useMemo(
    () =>
      players
        .filter((p) => p.status === "registered" && !pairedIds.has(p.id) && !createPlayerIds.includes(p.id))
        .map((p) => ({
          value: p.id,
          label: p.discriminator ? `${p.displayName} #${p.discriminator}` : p.displayName,
        })),
    [players, pairedIds, createPlayerIds]
  );

  const matchLabel = (match: TournamentMatch) =>
    `${match.bracketPosition ? `${match.bracketPosition} — ` : ""}${match.players
      .map((p) => playerName(p.playerId))
      .join(" vs ")}${match.players.length === 1 ? ` (${t("common.bye")})` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">{t("common.roundN", { number: round.number })}</h2>
          <p className="mt-1 text-muted-foreground">{t("roundClient.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {round.status === "completed"
              ? t("common.roundStatus.completed")
              : t("common.roundStatus.in-progress")}
          </Badge>
          {round.status === "completed" && isLastRound && (
            <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)} disabled={anyBusy}>
              <LockOpen className="mr-2 h-4 w-4" />
              {t("roundClient.reopenRound")}
            </Button>
          )}
          {isLastRound && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-800"
              onClick={() => setDeleteRoundOpen(true)}
              disabled={anyBusy}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("roundClient.deleteRound")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder={t("roundClient.searchPlayer")}
          className="max-w-xs"
        />
        <Button onClick={() => setCreateOpen(true)} disabled={anyBusy}>
          <Plus className="mr-2 h-4 w-4" />
          {t("roundClient.createMatch")}
        </Button>
      </div>

      {matches.length === 0 ? (
        <p className="text-muted-foreground">{t("roundClient.noMatches")}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    {t("roundClient.headerMatch")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    {t("roundClient.headerStatus")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    {t("roundClient.headerResult")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                    {t("roundClient.headerActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {search.pageItems.map((match) => {
                  const isBye = match.players.length === 1;
                  return (
                    <tr key={match.id}>
                      <td className="px-3 py-2 font-medium">{matchLabel(match)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">
                          {MATCH_STATUS_KEYS[match.status]
                            ? t(MATCH_STATUS_KEYS[match.status])
                            : match.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {isBye ? (
                          t("roundClient.autoWin")
                        ) : match.status === "completed" ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
                            {match.players.map((p, i) => (
                              <span key={p.playerId} className="inline-flex items-center">
                                {i > 0 && <span className="mr-1 text-muted-foreground">·</span>}
                                <MatchPlayerName
                                  isWinner={match.winnerIds.includes(p.playerId)}
                                  name={
                                    <>
                                      {playerName(p.playerId)} <span className="font-mono">{p.score}</span>
                                    </>
                                  }
                                />
                              </span>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {match.status === "in-progress" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => confirmMatch(match)}
                              disabled={anyBusy}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              {t("roundClient.validate")}
                            </Button>
                          )}
                          {!isBye && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditMatch(match)}
                              disabled={anyBusy}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {t("roundClient.editScore")}
                            </Button>
                          )}
                          {!isBye && match.status !== "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingClear(match)}
                              disabled={anyBusy}
                              aria-label={t("roundClient.clearResultAria", {
                                match: matchLabel(match),
                              })}
                            >
                              <Eraser className="h-4 w-4" />
                            </Button>
                          )}
                          {isLastRound && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => setPendingDelete(match)}
                              disabled={anyBusy}
                              aria-label={t("roundClient.deleteMatchAria", {
                                match: matchLabel(match),
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {search.pageItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">
                      {t("roundClient.noSearchResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={search.page}
            totalPages={search.totalPages}
            total={search.total}
            onPage={search.setPage}
          />
        </>
      )}

      {/* Modale : modifier le score d'un match */}
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
                submitting={submitting}
                submitLabel={t("common.save")}
                onSubmit={(games) => submitReport(editMatch, games)}
              />
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
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        setCreatePlayerIds((current) => current.filter((pid) => pid !== id))
                      }
                      aria-label={t("roundClient.removePlayerAria", { name: playerName(id) })}
                    >
                      <X className="h-4 w-4" />
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

      {/* Modale : confirmation de suppression d'un match */}
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

      {/* Modale : confirmation de suppression d'un résultat rapporté */}
      <ConfirmDialog
        open={pendingClear !== null}
        onOpenChange={(open) => !open && setPendingClear(null)}
        title={t("roundClient.clearResultTitle")}
        description={
          pendingClear
            ? t("roundClient.clearResultDescription", { match: matchLabel(pendingClear) })
            : undefined
        }
        confirmLabel={t("roundClient.clearResultConfirm")}
        destructive
        busy={anyBusy}
        onConfirm={() => pendingClear && clearMatch(pendingClear)}
      />

      {/* Modale : confirmation de réouverture de la ronde */}
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
        onConfirm={reopenRound}
      />

      {/* Modale : confirmation de suppression de la ronde */}
      <ConfirmDialog
        open={deleteRoundOpen}
        onOpenChange={(open) => !open && setDeleteRoundOpen(false)}
        title={t("roundClient.deleteRoundTitle")}
        description={t("roundClient.deleteRoundDescription", { number: round.number })}
        confirmLabel={t("common.delete")}
        destructive
        busy={anyBusy}
        onConfirm={deleteRound}
      />
    </div>
  );
}
