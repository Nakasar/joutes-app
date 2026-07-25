"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getSyncKeys, removeSyncKey } from "@/lib/tournament-sync-storage";

type SyncedTournament = {
  key: string;
  tournament: {
    id: string;
    name: string;
    status: "draft" | "in-progress" | "completed";
    createdAt: string;
  };
  player: { id: string; displayName: string; discriminator?: string; status: string };
};

type OrganizedTournament = {
  id: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  createdAt: string;
};

type PlayedTournament = {
  tournament: OrganizedTournament;
  player: { id: string; displayName: string; discriminator?: string; status: string };
};

// Tournoi où l'utilisateur joue, quelle qu'en soit la provenance : clé de
// synchronisation de ce navigateur (`key` présent, retirable) et/ou compte
// connecté inscrit comme joueur.
type PlayerEntry = {
  tournament: OrganizedTournament;
  player: { id: string; displayName: string; discriminator?: string; status: string };
  key?: string;
};

type StatusFilter = "all" | "in-progress" | "draft" | "completed";

const FILTERS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "list.filters.all" },
  { value: "in-progress", labelKey: "list.filters.inProgress" },
  { value: "draft", labelKey: "list.filters.upcoming" },
  { value: "completed", labelKey: "list.filters.past" },
];

export default function TournamentsPage() {
  const t = useTranslations("Tournaments");
  const [entries, setEntries] = useState<SyncedTournament[]>([]);
  const [played, setPlayed] = useState<PlayedTournament[]>([]);
  const [organized, setOrganized] = useState<OrganizedTournament[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  // Tournoi en attente de confirmation de retrait de synchronisation.
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    const keys = Object.values(getSyncKeys());

    // Tournois organisés par l'utilisateur connecté. Sans session l'endpoint
    // répond 401 : on traite tout non-OK comme une liste vide.
    const organizedPromise = fetch("/api/tournaments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: OrganizedTournament[]) => setOrganized(Array.isArray(data) ? data : []))
      .catch(() => setOrganized([]));

    // Tournois où l'utilisateur connecté est inscrit comme joueur (via son
    // compte, sans clé de synchronisation). 401 si non connecté → liste vide.
    const playedPromise = fetch("/api/tournaments/playing")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PlayedTournament[]) => setPlayed(Array.isArray(data) ? data : []))
      .catch(() => setPlayed([]));

    // Tournois synchronisés sur ce navigateur via une clé de joueur.
    const syncedPromise =
      keys.length === 0
        ? Promise.resolve()
        : fetch("/api/tournaments/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys }),
          })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: SyncedTournament[]) => setEntries(Array.isArray(data) ? data : []))
            .catch(() => setEntries([]));

    Promise.all([organizedPromise, playedPromise, syncedPromise]).finally(() => setLoading(false));
  }, []);

  // Fusionne les tournois joués (compte connecté) et synchronisés (clé de ce
  // navigateur), dédoublonnés par tournoi. La clé est conservée quand elle
  // existe, pour permettre le retrait de la synchronisation.
  const playerEntries = useMemo<PlayerEntry[]>(() => {
    const byId = new Map<string, PlayerEntry>();
    for (const entry of played) {
      byId.set(entry.tournament.id, { tournament: entry.tournament, player: entry.player });
    }
    for (const entry of entries) {
      byId.set(entry.tournament.id, {
        tournament: entry.tournament,
        player: entry.player,
        key: entry.key,
      });
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.tournament.createdAt).getTime() - new Date(a.tournament.createdAt).getTime()
    );
  }, [entries, played]);

  const filtered = useMemo(
    () => playerEntries.filter((e) => filter === "all" || e.tournament.status === filter),
    [playerEntries, filter]
  );

  const filteredOrganized = useMemo(
    () => organized.filter((t) => filter === "all" || t.status === filter),
    [organized, filter]
  );

  const handleRemove = (tournamentId: string) => {
    removeSyncKey(tournamentId);
    setEntries((current) => current.filter((e) => e.tournament.id !== tournamentId));
    setPendingRemove(null);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("list.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("list.description")}</p>
        </div>
        <Button asChild>
          <Link href="/tournaments/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("list.createButton")}
          </Link>
        </Button>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(({ value, labelKey }) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {t(labelKey)}
          </Button>
        ))}
      </div>

      {!loading && filteredOrganized.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t("list.organizedTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredOrganized.map((tournament) => (
              <Card key={tournament.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{tournament.name}</CardTitle>
                  <Badge variant="secondary">
                    {t(`common.tournamentStatus.${tournament.status}`)}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm">
                    <Link href={`/tournaments/${tournament.id}/organizer`}>{t("list.manage")}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("list.playingTitle")}</h2>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : playerEntries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("list.emptyPlaying")}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("list.emptyFilter")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((entry) => (
            <Card key={entry.tournament.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">{entry.tournament.name}</CardTitle>
                <Badge variant="secondary">
                  {t(`common.tournamentStatus.${entry.tournament.status}`)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("list.registeredAs")}{" "}
                  <span className="font-medium">
                    {entry.player.displayName}
                    {entry.player.discriminator && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        #{entry.player.discriminator}
                      </span>
                    )}
                  </span>
                  {entry.player.status === "dropped" ? ` ${t("list.dropped")}` : ""}
                </p>
                <div className="flex items-center justify-between">
                  <Button asChild size="sm">
                    <Link href={`/tournaments/${entry.tournament.id}/player`}>
                      {t("list.playerPortal")}
                    </Link>
                  </Button>
                  {entry.key && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-800"
                      onClick={() => setPendingRemove(entry.tournament.id)}
                      aria-label={t("list.removeSyncAria")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </section>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={t("list.removeDialog.title")}
        description={t("list.removeDialog.description")}
        confirmLabel={t("list.removeDialog.confirm")}
        destructive
        onConfirm={() => pendingRemove && handleRemove(pendingRemove)}
      />
    </div>
  );
}
