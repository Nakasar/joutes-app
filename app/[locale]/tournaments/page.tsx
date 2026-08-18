"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus, QrCode, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { getSyncKeys, removeSyncKey } from "@/lib/tournament-sync-storage";
import type { TournamentPhaseType } from "@/lib/types/Tournament";
import { TournamentClock } from "./TournamentClock";

type TournamentSummary = {
  playersCount: number;
  phases: { type: TournamentPhaseType; plannedRounds?: number; topCut?: number }[];
  currentRound: {
    id: string;
    number: number;
    plannedRounds?: number;
    reportedMatches: number;
    totalMatches: number;
  } | null;
};

type BaseTournament = {
  id: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  createdAt: string;
  location?: string;
};

type OrganizedTournament = BaseTournament & { summary?: TournamentSummary };

type SyncedTournament = {
  key: string;
  tournament: BaseTournament;
  player: { id: string; displayName: string; discriminator?: string; status: string };
};

type PlayedTournament = {
  tournament: BaseTournament;
  player: { id: string; displayName: string; discriminator?: string; status: string };
};

// Tournoi où l'utilisateur joue, quelle qu'en soit la provenance : clé de
// synchronisation de ce navigateur (`key` présent, retirable) et/ou compte
// connecté inscrit comme joueur.
type PlayerEntry = {
  tournament: BaseTournament;
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

  const filteredPlayer = useMemo(
    () => playerEntries.filter((e) => filter === "all" || e.tournament.status === filter),
    [playerEntries, filter]
  );

  const filteredOrganized = useMemo(
    () => organized.filter((o) => filter === "all" || o.status === filter),
    [organized, filter]
  );

  // Tournoi mis en avant : celui qui tourne. C'est le seul sur lequel
  // l'organisateur a une action à mener dans l'instant.
  const featured = filteredOrganized.find((o) => o.status === "in-progress") ?? null;
  const others = filteredOrganized.filter((o) => o.id !== featured?.id);

  const handleRemove = (tournamentId: string) => {
    removeSyncKey(tournamentId);
    setEntries((current) => current.filter((e) => e.tournament.id !== tournamentId));
    setPendingRemove(null);
  };

  // Résumé « 64 joueurs · Suisse + top 8 · Le Repaire » d'un tournoi.
  const describe = (tournament: OrganizedTournament) => {
    const parts: string[] = [];
    const summary = tournament.summary;
    if (summary) {
      parts.push(t("list.playersCount", { count: summary.playersCount }));
      const format = summary.phases
        .map((p) => {
          const cut = p.topCut ? ` ${t("organizerPhases.summary.topN", { count: p.topCut })}` : "";
          return `${t(`common.phaseType.${p.type}`)}${cut}`;
        })
        .join(" + ");
      if (format) parts.push(format);
    }
    if (tournament.location) parts.push(tournament.location);
    return parts.join(" · ");
  };

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("list.title")}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground [text-wrap:pretty]">
            {t("list.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/tournaments/join">
              <QrCode className="size-4" />
              {t("list.joinWithQr")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/tournaments/new">
              <Plus className="size-4" />
              {t("list.createButton")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === value
                ? "border-transparent bg-foreground text-background"
                : "bg-card hover:bg-accent"
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          {featured && (
            <div className="mb-4 flex items-stretch overflow-hidden rounded-xl bg-neutral-950 text-white">
              <div className="w-1.5 shrink-0 bg-sky-500" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-5 p-5">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-300">
                      {featured.summary?.currentRound
                        ? t("list.liveRound", {
                            number: featured.summary.currentRound.number,
                            total: featured.summary.currentRound.plannedRounds ?? "—",
                          })
                        : t("common.tournamentStatus.in-progress")}
                    </span>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">{featured.name}</p>
                  <p className="mt-1 text-[13px] text-neutral-400">{describe(featured)}</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <TournamentClock tournamentId={featured.id} />
                    <p className="text-xs text-neutral-400">{t("list.timeRemaining")}</p>
                  </div>
                  <Button variant="secondary" asChild>
                    <Link href={`/tournaments/${featured.id}/organizer`}>{t("list.pilot")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="mb-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((tournament) => (
                <div key={tournament.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold">{tournament.name}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {t(`common.tournamentStatus.${tournament.status}`)}
                    </Badge>
                  </div>
                  <p className="mb-4 mt-2 text-[13px] text-muted-foreground">
                    {describe(tournament) || t("list.noDetails")}
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/tournaments/${tournament.id}/organizer`}>
                      {tournament.status === "draft"
                        ? t("list.finishSetup")
                        : tournament.status === "completed"
                          ? t("list.seeResults")
                          : t("list.manage")}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {filteredOrganized.length === 0 && organized.length > 0 && (
            <p className="mb-9 text-sm text-muted-foreground">{t("list.emptyFilter")}</p>
          )}

          <h2 className="mb-3 text-[15px] font-semibold text-muted-foreground">
            {t("list.playingTitle")}
          </h2>

          {playerEntries.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
              {t("list.emptyPlaying")}
            </div>
          ) : filteredPlayer.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
              {t("list.emptyFilter")}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredPlayer.map((entry) => (
                <div
                  key={entry.tournament.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{entry.tournament.name}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {t("list.registeredAs")}{" "}
                      <span className="font-medium text-foreground">
                        {entry.player.displayName}
                        {entry.player.discriminator && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            #{entry.player.discriminator}
                          </span>
                        )}
                      </span>
                      {entry.player.status === "dropped" ? ` ${t("list.dropped")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild>
                      <Link href={`/tournaments/${entry.tournament.id}/player`}>
                        {t("list.playerPortal")}
                      </Link>
                    </Button>
                    {entry.key && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingRemove(entry.tournament.id)}
                        aria-label={t("list.removeSyncAria")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
