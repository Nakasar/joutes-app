"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { ChevronDown, Crown, Plus, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  TimelineEntry,
  TimelinePlayer,
  TimelineYearGroup,
} from "@/lib/leagues/timeline";

type Filter = "all" | "completed" | "in-progress";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "completed", label: "Terminés" },
  { key: "in-progress", label: "En cours" },
];

/**
 * Même fuseau que `yearOf` côté serveur, et pour la même raison : sans lui, un
 * tournoi du 31 décembre au soir s'afficherait « 31 décembre 2025 » sous un
 * en-tête « 2026 ». Fixer le fuseau évite aussi que le texte rendu au serveur
 * diffère de celui rendu chez un visiteur qui n'est pas à l'heure de Paris.
 */
function formatDate(iso: string) {
  const date = DateTime.fromISO(iso).setZone("Europe/Paris").setLocale("fr");
  return date.isValid ? date.toFormat("d LLLL yyyy") : "";
}

/** Photo de profil, ou initiales quand le joueur n'en a pas. */
function PlayerAvatar({
  player,
  className,
}: {
  player: TimelinePlayer;
  className?: string;
}) {
  if (player.avatar) {
    return (
      <img
        src={player.avatar}
        alt=""
        className={cn("rounded-full object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-muted text-muted-foreground flex items-center justify-center font-semibold shrink-0",
        className
      )}
      aria-hidden="true"
    >
      {player.initials}
    </div>
  );
}

function WinnerBadge({ winner }: { winner: TimelinePlayer }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 py-2 pl-2 pr-3.5">
      <div className="relative shrink-0">
        <PlayerAvatar player={winner} className="h-10 w-10 text-sm" />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-card bg-yellow-500">
          <Crown className="h-2.5 w-2.5 text-yellow-950" />
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-yellow-700 dark:text-yellow-500">
          Vainqueur
        </div>
        <div className="truncate text-sm font-semibold">{winner.label}</div>
      </div>
    </div>
  );
}

function TimelineCard({
  entry,
  open,
  onToggle,
}: {
  entry: TimelineEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const isLive = entry.status === "in-progress";

  return (
    <div className="mb-3.5 ml-1 overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-muted-foreground/30">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-start justify-between gap-4 p-4 text-left sm:p-5"
      >
        <div className="flex min-w-[15rem] grow flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {formatDate(entry.date)}
            </span>
            {entry.gameName && <Badge variant="secondary">{entry.gameName}</Badge>}
            {isLive && (
              <Badge
                variant="outline"
                className="border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400"
              >
                <span className="size-1.5 rounded-full bg-orange-500" />
                En cours
              </Badge>
            )}
          </div>

          <h2 className="text-base font-semibold leading-snug tracking-tight text-pretty sm:text-[17px]">
            {entry.name}
          </h2>

          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {entry.playersCount} joueur{entry.playersCount > 1 ? "s" : ""}
            </span>
            {entry.points > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                {entry.points} pts distribués
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {entry.winner ? (
            <WinnerBadge winner={entry.winner} />
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-3.5 text-[13px] text-muted-foreground">
              Pas encore de vainqueur
            </div>
          )}
          <ChevronDown
            className={cn(
              "h-4.5 w-4.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t bg-muted px-4 pb-4 pt-4 sm:px-5">
          {entry.podium.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* Un tournoi en cours n'a pas de podium : ce qu'on montre est
                  le classement à l'instant présent, et le dire évite de faire
                  passer une position provisoire pour un résultat. */}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isLive ? "Classement provisoire" : "Podium"}
              </div>
              <div className="flex flex-col gap-1.5">
                {entry.podium.map((player) => (
                  <div
                    key={`${entry.tournamentId}-${player.rank}`}
                    className="flex flex-wrap items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5"
                  >
                    <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
                      {player.rankLabel}
                    </span>
                    <PlayerAvatar player={player} className="h-6 w-6 text-[10px]" />
                    <span className="min-w-0 grow truncate text-[13px] font-medium">
                      {player.label}
                    </span>
                    {player.record && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {player.record}
                      </span>
                    )}
                    <span className="text-[13px] font-semibold">{player.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entry.feats.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hauts faits décernés
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entry.feats.map((feat, index) => (
                  <Badge
                    key={`${entry.tournamentId}-feat-${index}`}
                    variant="outline"
                    className="bg-card py-1"
                  >
                    <Trophy className="text-amber-500" />
                    <span className="font-medium">{feat.title}</span>
                    <span className="text-muted-foreground">{feat.playerLabel}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/tournaments/${entry.tournamentId}`}>Ouvrir le tournoi</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeagueTimelineClient({
  groups,
  canManage,
  leagueId,
}: {
  groups: TimelineYearGroup[];
  canManage: boolean;
  leagueId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  // Une seule entrée ouverte à la fois : la timeline reste lisible, et l'œil
  // n'a pas à chercher où il en était.
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const all = groups.flatMap((group) => group.entries);
    return {
      all: all.length,
      completed: all.filter((entry) => entry.status === "completed").length,
      "in-progress": all.filter((entry) => entry.status === "in-progress").length,
    } satisfies Record<Filter, number>;
  }, [groups]);

  const visibleGroups = useMemo(() => {
    if (filter === "all") return groups;
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => entry.status === filter),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, filter]);

  if (counts.all === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed bg-card px-8 py-11 text-center">
        <div className="flex flex-col items-center opacity-45" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="h-6 w-0.5 bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="h-6 w-0.5 bg-gradient-to-b from-border to-transparent" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="font-semibold">La saison n&apos;a pas encore commencé</h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Rattachez un tournoi à cette ligue : à sa clôture, son classement et ses hauts
            faits viendront s&apos;inscrire ici, et alimenteront les points de la ligue.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/tournaments/new?leagueId=${leagueId}`}>
                <Plus className="h-4 w-4" />
                Créer un tournoi
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/leagues/${leagueId}/manage`}>Rattacher un tournoi existant</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const shown = visibleGroups.reduce((total, group) => total + group.entries.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Le total ne bouge pas avec le filtre : annoncer « 1 tournoi
            rattaché » parce qu'un filtre n'en laisse qu'un mentirait sur ce que
            contient la ligue. */}
        <p className="text-sm text-muted-foreground">
          {counts.all} tournoi{counts.all > 1 ? "s" : ""} rattaché
          {counts.all > 1 ? "s" : ""} à la ligue
          {filter !== "all" && ` · ${shown} affiché${shown > 1 ? "s" : ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={filter === option.key ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
            >
              {option.label}
              <span className="font-mono text-[11px] opacity-70">{counts[option.key]}</span>
            </Button>
          ))}
        </div>
      </div>

      {shown === 0 && (
        <p className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Aucun tournoi ne correspond à ce filtre.
        </p>
      )}

      <div className="flex flex-col">
        {visibleGroups.map((group) => (
          <div key={group.year} className="flex flex-col">
            {/* Séparateur d'année : le trait du rail le traverse pour ne pas
                se rompre entre deux saisons. */}
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center sm:grid-cols-[3.5rem_minmax(0,1fr)]">
              <div className="flex h-10 justify-center">
                <span className="h-full w-0.5 bg-border" />
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-medium tracking-widest text-muted-foreground">
                  {group.year}
                </span>
                <span className="h-px grow bg-border" />
              </div>
            </div>

            {group.entries.map((entry) => (
              <div
                key={entry.tournamentId}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)]"
              >
                <div className="relative flex justify-center">
                  <span className="h-full w-0.5 bg-border" />
                  <span
                    className={cn(
                      "absolute top-6 size-3 rounded-full border-2 border-background ring-2",
                      entry.status === "in-progress"
                        ? "bg-orange-500 ring-orange-500/20"
                        : "bg-yellow-500 ring-border"
                    )}
                  />
                </div>
                <TimelineCard
                  entry={entry}
                  open={openId === entry.tournamentId}
                  onToggle={() =>
                    setOpenId(openId === entry.tournamentId ? null : entry.tournamentId)
                  }
                />
              </div>
            ))}
          </div>
        ))}

        {/* Le rail s'arrête sur un point : il ne se coupe pas. */}
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <span className="h-4 w-0.5 bg-gradient-to-b from-border to-transparent" />
            <span className="size-1.5 rounded-full bg-border" />
          </div>
        </div>
      </div>
    </div>
  );
}
