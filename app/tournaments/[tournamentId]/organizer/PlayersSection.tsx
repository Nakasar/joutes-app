"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import type { TournamentPlayer } from "@/lib/types/Tournament";
import { JoinTournamentCard } from "./JoinTournamentCard";
import { PlayerSyncQRButton } from "./PlayerSyncQRButton";
import { TablePagination } from "../TablePagination";

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "outline" }> = {
  registered: { label: "REGISTERED", variant: "secondary" },
  "pre-registered": { label: "PRE-REGISTERED", variant: "outline" },
  dropped: { label: "DROPPED", variant: "outline" },
};

export function PlayersSection({
  tournamentId,
  initialPlayers,
  joinCode,
}: {
  tournamentId: string;
  initialPlayers: TournamentPlayer[];
  joinCode?: string;
}) {
  const [players, setPlayers] = useState<TournamentPlayer[]>(initialPlayers);
  const [newPlayerIdentifier, setNewPlayerIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TournamentPlayer | null>(null);

  const playersSearch = usePaginatedSearch(players, (p) => p.displayName, 25);
  const registeredPlayers = players.filter((p) => p.status === "registered");

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Une erreur est survenue");
      }
      return res.status === 204 ? null : res.json();
    },
    []
  );

  const refreshPlayers = useCallback(async () => {
    setPlayers(await api(`/api/tournaments/${tournamentId}/players`));
  }, [api, tournamentId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = () =>
    run(async () => {
      if (!newPlayerIdentifier.trim()) return;
      await api(`/api/tournaments/${tournamentId}/players`, {
        method: "POST",
        body: JSON.stringify({ identifier: newPlayerIdentifier.trim() }),
      });
      setNewPlayerIdentifier("");
      await refreshPlayers();
    });

  const removePlayer = (player: TournamentPlayer) =>
    run(async () => {
      // Un joueur avec des matchs ne peut pas être supprimé : on le retire du
      // format (drop) plutôt que de tenter une suppression qui échouerait.
      const res = await fetch(`/api/tournaments/${tournamentId}/players/${player.id}`, {
        method: "DELETE",
      });
      if (res.status === 409) {
        await api(`/api/tournaments/${tournamentId}/players/${player.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "dropped" }),
        });
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la suppression du joueur");
      }
      setPendingRemove(null);
      await refreshPlayers();
    });

  // Modifie le statut d'inscription d'un joueur.
  const setPlayerStatus = (player: TournamentPlayer, status: TournamentPlayer["status"]) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/players/${player.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refreshPlayers();
    });

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {joinCode && <JoinTournamentCard code={joinCode} />}
      <Card>
        <CardHeader>
          <CardTitle>
            Joueurs ({registeredPlayers.length} inscrit(s) / {players.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={newPlayerIdentifier}
                onChange={(e) => setNewPlayerIdentifier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPlayer();
                  }
                }}
                placeholder="Email, username#0000, ou nom d'un invité"
                maxLength={150}
              />
              <Button onClick={addPlayer} disabled={busy || !newPlayerIdentifier.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Un email ou un tag <code>username#0000</code> lie le joueur à son compte ; un email
              inconnu crée un compte, tout autre texte ajoute un invité.
            </p>
          </div>

          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun joueur inscrit pour le moment.</p>
          ) : (
            <div className="space-y-3">
              <Input
                value={playersSearch.query}
                onChange={(e) => playersSearch.setQuery(e.target.value)}
                placeholder="Rechercher un joueur..."
                className="max-w-xs"
              />
              <ul className="divide-y">
                {playersSearch.pageItems.map((player) => (
                  <li key={player.id} className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{player.displayName}</span>
                      {!player.userId && (
                        <span className="ml-2 text-xs text-muted-foreground">Invité</span>
                      )}
                      <Badge
                        variant={STATUS_BADGE[player.status]?.variant ?? "secondary"}
                        className="ml-2"
                      >
                        {STATUS_BADGE[player.status]?.label ?? player.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <PlayerSyncQRButton
                        tournamentId={tournamentId}
                        playerName={player.displayName}
                        syncKey={player.syncKey}
                      />
                      {player.status === "pre-registered" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPlayerStatus(player, "registered")}
                          disabled={busy}
                        >
                          Confirmer
                        </Button>
                      )}
                      {player.status === "dropped" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPlayerStatus(player, "registered")}
                          disabled={busy}
                        >
                          Réinscrire
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPlayerStatus(player, "dropped")}
                          disabled={busy}
                        >
                          Drop
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => setPendingRemove(player)}
                        disabled={busy}
                        aria-label={`Supprimer ${player.displayName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
                {playersSearch.pageItems.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">
                    Aucun joueur ne correspond à la recherche.
                  </li>
                )}
              </ul>
              <TablePagination
                page={playersSearch.page}
                totalPages={playersSearch.totalPages}
                total={playersSearch.total}
                onPage={playersSearch.setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Supprimer le joueur"
        description={
          pendingRemove
            ? `Retirer ${pendingRemove.displayName} du tournoi ? S'il a déjà des matchs, il sera marqué comme DROPPED plutôt que supprimé.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        busy={busy}
        onConfirm={() => pendingRemove && removePlayer(pendingRemove)}
      />
    </div>
  );
}
