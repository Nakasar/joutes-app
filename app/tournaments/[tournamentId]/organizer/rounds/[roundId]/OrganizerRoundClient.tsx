"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, X } from "lucide-react";
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
import { TablePagination } from "../../../TablePagination";

const MATCH_STATUS_LABELS: Record<string, string> = {
  pending: "À jouer",
  "in-progress": "En attente de confirmation",
  completed: "Terminé",
  disputed: "Contesté",
};

type RoundPlayer = Pick<TournamentPlayer, "id" | "displayName" | "status">;

type Props = {
  tournamentId: string;
  round: TournamentRound;
  initialMatches: TournamentMatch[];
  players: RoundPlayer[];
  resultMode: TournamentResultMode;
  bestOf: number;
  // La suppression de match n'est possible que dans la dernière ronde.
  isLastRound: boolean;
};

export function OrganizerRoundClient({
  tournamentId,
  round,
  initialMatches,
  players,
  resultMode,
  bestOf,
  isLastRound,
}: Props) {
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

  // Une opération est en cours (suppression/création ou envoi d'un score) :
  // sert à désactiver toutes les actions et éviter des requêtes concurrentes.
  const anyBusy = busy || submitting;

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const playerName = useCallback(
    (playerId: string) => playersById.get(playerId)?.displayName ?? "Inconnu",
    [playersById]
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
      setError("Renseignez au moins une partie.");
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
          throw new Error(body.error ?? "Erreur lors de l'enregistrement du résultat");
        }
        await refresh();
        setEditMatch(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du résultat");
      } finally {
        setSubmitting(false);
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
          throw new Error(body.error ?? "Erreur lors de la suppression du match");
        }
        setPendingDelete(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la suppression du match");
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
          throw new Error(body.error ?? "Erreur lors de la création du match");
        }
        await refresh();
        setCreateOpen(false);
        setCreatePlayerIds([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la création du match");
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
        .map((p) => ({ value: p.id, label: p.displayName })),
    [players, pairedIds, createPlayerIds]
  );

  const matchLabel = (match: TournamentMatch) =>
    `${match.bracketPosition ? `${match.bracketPosition} — ` : ""}${match.players
      .map((p) => playerName(p.playerId))
      .join(" vs ")}${match.players.length === 1 ? " (BYE)" : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ronde {round.number}</h1>
          <p className="mt-1 text-muted-foreground">Saisie des résultats</p>
        </div>
        <Badge variant="secondary">{round.status === "completed" ? "Terminée" : "En cours"}</Badge>
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
          placeholder="Rechercher un joueur..."
          className="max-w-xs"
        />
        <Button onClick={() => setCreateOpen(true)} disabled={anyBusy}>
          <Plus className="mr-2 h-4 w-4" />
          Créer un match
        </Button>
      </div>

      {matches.length === 0 ? (
        <p className="text-muted-foreground">Aucun match dans cette ronde.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    Match
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    Statut
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                    Résultat
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                    Actions
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
                        <Badge variant="outline">{MATCH_STATUS_LABELS[match.status] ?? match.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {isBye
                          ? "Victoire automatique"
                          : match.status === "completed"
                            ? match.players
                                .map(
                                  (p) =>
                                    `${playerName(p.playerId)} ${p.score}${
                                      match.winnerIds.includes(p.playerId) ? " 🏆" : ""
                                    }`
                                )
                                .join(" · ")
                            : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {!isBye && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditMatch(match)}
                              disabled={anyBusy}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Modifier le score
                            </Button>
                          )}
                          {isLastRound && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => setPendingDelete(match)}
                              disabled={anyBusy}
                              aria-label={`Supprimer le match ${matchLabel(match)}`}
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
                      Aucun match ne correspond à la recherche.
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

      <Button variant="outline" asChild>
        <Link href={`/tournaments/${tournamentId}/organizer/rounds`}>Retour aux rondes</Link>
      </Button>

      {/* Modale : modifier le score d'un match */}
      <Dialog open={editMatch !== null} onOpenChange={(open) => !open && setEditMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le score</DialogTitle>
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
                submitLabel="Enregistrer"
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
            <DialogTitle>Créer un match</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Combobox
                options={availableOptions}
                value=""
                onChange={(id) => {
                  if (id) setCreatePlayerIds((current) => [...current, id]);
                }}
                placeholder="Ajouter un joueur…"
                searchPlaceholder="Rechercher un joueur…"
                emptyMessage="Aucun joueur disponible."
                disabled={anyBusy}
              />
              <p className="text-xs text-muted-foreground">
                Seuls les joueurs actifs non déjà appariés dans cette ronde sont proposés. Un seul
                joueur crée un BYE.
              </p>
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
                      aria-label={`Retirer ${playerName(id)}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={anyBusy}>
                Annuler
              </Button>
              <Button onClick={createMatch} disabled={anyBusy || createPlayerIds.length === 0}>
                Créer le match
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale : confirmation de suppression d'un match */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Supprimer le match"
        description={
          pendingDelete
            ? `Supprimer le match « ${matchLabel(pendingDelete)} » et ses résultats ? Cette action est irréversible.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        busy={anyBusy}
        onConfirm={() => pendingDelete && deleteMatch(pendingDelete)}
      />
    </div>
  );
}
