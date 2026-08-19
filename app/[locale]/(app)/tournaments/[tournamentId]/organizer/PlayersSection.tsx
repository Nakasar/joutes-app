"use client";

import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { Check, Flag, Plus, Table as TableIcon, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { usePaginatedSearch } from "@/lib/use-paginated-search.ts";
import type { TournamentPlayer } from "@/lib/types/Tournament.ts";
import { JoinTournamentCard } from "./JoinTournamentCard.tsx";
import { OrganizerPageHeader } from "./OrganizerPageHeader.tsx";
import { PlayerSyncQRButton } from "./PlayerSyncQRButton.tsx";
import { PlayerNameTag } from "../PlayerNameTag.tsx";
import { TablePagination } from "../TablePagination.tsx";

const STATUS_VARIANT: Record<string, "secondary" | "outline"> = {
  registered: "secondary",
  "pre-registered": "outline",
  dropped: "outline",
};

/**
 * Liste des joueurs du tournoi, tournée vers le pointage à l'arrivée : la case
 * de présence est la première colonne et l'action la plus fréquente le jour J.
 * Le reste (table fixe, statut d'inscription, QR de synchronisation) reste
 * accessible sur la ligne, et la fiche détaillée s'ouvre sur le nom.
 */
export function PlayersSection({
  tournamentId,
  initialPlayers,
  joinCode,
  penaltyCounts = {},
}: {
  tournamentId: string;
  initialPlayers: TournamentPlayer[];
  joinCode?: string;
  penaltyCounts?: Record<string, number>;
}) {
  const t = useTranslations("Tournaments");
  const [players, setPlayers] = useState<TournamentPlayer[]>(initialPlayers);
  const [newPlayerIdentifier, setNewPlayerIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TournamentPlayer | null>(null);
  const [showJoinCard, setShowJoinCard] = useState(false);

  const playersSearch = usePaginatedSearch(players, (p) => p.displayName, 25);
  const expected = players.filter((p) => p.status !== "dropped");
  const checkedIn = expected.filter((p) => p.checkedInAt);

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
        throw new Error(body.error ?? t("common.error"));
      }
      return res.status === 204 ? null : res.json();
    },
    [t]
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
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const patchPlayer = (player: TournamentPlayer, body: Record<string, unknown>) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/players/${player.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await refreshPlayers();
    });

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
        throw new Error(body.error ?? t("organizerPlayers.removeError"));
      }
      setPendingRemove(null);
      await refreshPlayers();
    });

  // Statut d'inscription : confirmer une pré-inscription, retirer un joueur du
  // tournoi, ou le réinscrire après coup. Un drop n'est pas définitif — un
  // joueur parti puis revenu doit pouvoir reprendre sa place.
  const setPlayerStatus = (player: TournamentPlayer, status: TournamentPlayer["status"]) =>
    patchPlayer(player, { status });

  // Table fixe du joueur (conservée tout le tournoi) : saisie libre, vide =
  // retirer. Enregistrée à la perte de focus si la valeur a changé.
  const setFixedTable = (player: TournamentPlayer, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    if (next === (player.fixedTableNumber ?? null)) return;
    void patchPlayer(player, { fixedTableNumber: next });
  };

  return (
    <div>
      <OrganizerPageHeader
        title={t("organizerPlayers.pageTitle")}
        description={t("organizerPlayers.checkInSummary", {
          checked: checkedIn.length,
          total: expected.length,
        })}
        actions={
          <>
            <Input
              value={playersSearch.query}
              onChange={(e) => playersSearch.setQuery(e.target.value)}
              placeholder={t("organizerPlayers.searchPlaceholder")}
              className="w-full sm:w-60"
            />
            {joinCode && (
              <Button variant="outline" onClick={() => setShowJoinCard((v) => !v)}>
                {t("organizerPlayers.joinQr")}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {joinCode && showJoinCard && (
        <div className="mb-4">
          <JoinTournamentCard code={joinCode} />
        </div>
      )}

      <div className="mb-4 space-y-1">
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
            placeholder={t("organizerPlayers.addPlaceholder")}
            maxLength={150}
            className="max-w-sm"
          />
          <Button onClick={addPlayer} disabled={busy || !newPlayerIdentifier.trim()}>
            <Plus className="size-4" />
            {t("organizerPlayers.add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.rich("organizerPlayers.addHint", { code: (chunks) => <code>{chunks}</code> })}
        </p>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("organizerPlayers.empty")}</p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {playersSearch.pageItems.map((player) => {
              const isCheckedIn = !!player.checkedInAt;
              const penalties = penaltyCounts[player.id] ?? 0;
              return (
                <li key={player.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => patchPlayer(player, { checkedIn: !isCheckedIn })}
                    disabled={busy || player.status === "dropped"}
                    aria-pressed={isCheckedIn}
                    aria-label={t("organizerPlayers.checkInAria", { name: player.displayName })}
                    className={cn(
                      "flex size-6.5 shrink-0 items-center justify-center rounded-lg border-[1.5px] transition-colors disabled:opacity-40",
                      isCheckedIn
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-input hover:border-foreground/40"
                    )}
                  >
                    {isCheckedIn && <Check className="size-3.5" strokeWidth={3} />}
                  </button>

                  <Link
                    href={`/tournaments/${tournamentId}/organizer/players/${player.id}`}
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium hover:underline",
                      !isCheckedIn && "text-muted-foreground"
                    )}
                  >
                    <PlayerNameTag name={player.displayName} discriminator={player.discriminator} />
                    {!player.userId && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("organizerPlayers.guest")}
                      </span>
                    )}
                    {penalties > 0 && (
                      <Flag
                        className="ml-1.5 inline size-3.5 text-destructive"
                        aria-label={t("organizerPlayers.hasPenalties", { count: penalties })}
                      />
                    )}
                  </Link>

                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {player.status === "dropped"
                      ? t("common.playerStatus.dropped")
                      : isCheckedIn
                        ? t("organizerPlayers.present")
                        : t("organizerPlayers.notCheckedIn")}
                  </span>

                  <Badge variant={STATUS_VARIANT[player.status] ?? "secondary"} className="shrink-0">
                    {STATUS_VARIANT[player.status]
                      ? t(`common.playerStatus.${player.status}`)
                      : player.status}
                  </Badge>

                  <div className="flex flex-wrap shrink-0 items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TableIcon className="size-4" aria-hidden="true" />
                      <Input
                        key={`${player.id}-${player.fixedTableNumber ?? ""}`}
                        type="number"
                        min={0}
                        max={9999}
                        className="h-8 w-16"
                        defaultValue={player.fixedTableNumber ?? ""}
                        placeholder="—"
                        onBlur={(e) => setFixedTable(player, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        disabled={busy}
                        aria-label={t("organizerPlayers.fixedTableAria", { name: player.displayName })}
                        title={t("organizerPlayers.fixedTableTitle")}
                      />
                    </label>
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
                        {t("common.confirm")}
                      </Button>
                    )}
                    {player.status === "dropped" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPlayerStatus(player, "registered")}
                        disabled={busy}
                      >
                        {t("organizerPlayers.reregister")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPlayerStatus(player, "dropped")}
                        disabled={busy}
                      >
                        {t("organizerPlayers.drop")}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/tournaments/${tournamentId}/organizer/players/${player.id}`}>
                        {t("organizerPlayers.openSheet")}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingRemove(player)}
                      disabled={busy}
                      aria-label={t("organizerPlayers.removeAria", { name: player.displayName })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
            {playersSearch.pageItems.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {t("organizerPlayers.noSearchResults")}
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

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={t("organizerPlayers.removeDialogTitle")}
        description={
          pendingRemove
            ? t("organizerPlayers.removeDialogDescription", { name: pendingRemove.displayName })
            : undefined
        }
        confirmLabel={t("common.delete")}
        destructive
        busy={busy}
        onConfirm={() => pendingRemove && removePlayer(pendingRemove)}
      />
    </div>
  );
}
