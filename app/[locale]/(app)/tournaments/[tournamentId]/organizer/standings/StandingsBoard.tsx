"use client";

import { Fragment, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useLocale, useTranslations } from "next-intl";
import { Download, Maximize2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { formatDuration } from "@/lib/tournament-timer.ts";
import { formatTiebreaker, gameWinPercentage } from "@/lib/tournaments/standings-export.ts";
import type { MatchStatDefinition } from "@/lib/tournaments/game-presets.ts";
import { OrganizerPageHeader } from "../OrganizerPageHeader.tsx";

export type StandingsRow = {
  playerId: string;
  displayName: string;
  discriminator?: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesLost: number;
  opponentMatchWinPercentage?: number;
  // Cumul des statistiques secondaires du preset, par clé. Absent hors preset.
  stats?: Record<string, number>;
  // Temps de résolution du puzzle. Absent hors phase puzzle, ou tant que le
  // joueur n'a pas terminé.
  puzzleTimeSeconds?: number;
  playerStatus: string;
};

export type StandingsSnapshot = {
  // `null` = classement courant, calculé en direct.
  roundId: string | null;
  roundNumber: number | null;
  validatedAt?: string;
  rows: StandingsRow[];
};

/**
 * Classement de la phase, navigable ronde par ronde.
 *
 * Un classement figé (ronde validée) et le classement courant ne se lisent pas
 * pareil : le premier fait foi pour les appariements, le second bouge à chaque
 * résultat saisi. Le badge en haut à droite dit lequel est à l'écran.
 */
export function StandingsBoard({
  tournamentId,
  snapshots,
  statColumns = [],
  topCut,
}: {
  tournamentId: string;
  snapshots: StandingsSnapshot[];
  // Colonnes de statistiques du preset, dans l'ordre de départage.
  statColumns?: MatchStatDefinition[];
  topCut?: number;
}) {
  const t = useTranslations("Tournaments");
  const locale = useLocale();

  // Par défaut, le dernier classement disponible — celui qui décrit la
  // situation présente du tournoi.
  const [selectedIndex, setSelectedIndex] = useState(snapshots.length - 1);
  const snapshot = snapshots[selectedIndex] ?? snapshots[snapshots.length - 1];

  const rows = snapshot?.rows ?? [];
  // Colonne du chronomètre : ouverte dès qu'un temps a été relevé (phase
  // puzzle). Les joueurs qui n'ont pas terminé y lisent « — ».
  const hasPuzzleTimes = rows.some((row) => row.puzzleTimeSeconds !== undefined);
  const stats = useMemo(() => {
    const ranked = rows.filter((r) => r.playerStatus !== "dropped");
    const dropped = rows.length - ranked.length;
    const perfect = rows.filter((r) => r.losses === 0 && r.draws === 0 && r.wins > 0).length;
    return { ranked: ranked.length, dropped, perfect };
  }, [rows]);

  if (!snapshot) {
    return (
      <div>
        <OrganizerPageHeader title={t("standings.pageTitle")} />
        <p className="text-sm text-muted-foreground">{t("standings.empty")}</p>
      </div>
    );
  }

  const exportHref = snapshot.roundId
    ? `/api/tournaments/${tournamentId}/standings/export?roundId=${snapshot.roundId}`
    : `/api/tournaments/${tournamentId}/standings/export`;

  return (
    <div>
      <OrganizerPageHeader
        title={t("standings.pageTitle")}
        description={t("standings.tiebreakers")}
        actions={
          <>
            <span
              className={cn(
                "inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                snapshot.validatedAt
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {snapshot.validatedAt ? t("standings.frozen") : t("standings.live")}
            </span>
            <Button variant="outline" size="sm" asChild>
              <a href={exportHref}>
                <Download className="size-4" />
                {t("standings.exportCsv")}
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("matchExport.print")}
            </Button>
            <Button size="sm" asChild>
              <Link href={`/tournaments/${tournamentId}/timer`} target="_blank">
                <Maximize2 className="size-4" />
                {t("standings.showOnScreen")}
              </Link>
            </Button>
          </>
        }
      >
        {snapshots.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {snapshots.map((snap, index) => (
              <button
                key={snap.roundId ?? "current"}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-pressed={index === selectedIndex}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  index === selectedIndex
                    ? "border-transparent bg-foreground text-background"
                    : "bg-card hover:bg-accent"
                )}
              >
                {snap.roundNumber === null
                  ? t("standings.currentTab")
                  : t("standings.afterRound", { number: snap.roundNumber })}
              </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">{t("standings.browseHint")}</span>
          </div>
        )}
      </OrganizerPageHeader>

      <div className="mb-4 flex flex-wrap gap-3">
        {[
          { label: t("standings.statRanked"), value: stats.ranked },
          { label: t("standings.statDropped"), value: stats.dropped },
          { label: t("standings.statPerfect"), value: stats.perfect },
          {
            label: t("standings.statCutLine"),
            value: topCut ? t("organizerPhases.summary.topN", { count: topCut }) : "—",
          },
        ].map((stat) => (
          <div key={stat.label} className="min-w-36 flex-1 rounded-xl border bg-card p-3.5">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-0.5 text-[22px] font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="w-12 px-4 py-2.5 text-left font-semibold">#</th>
              <th className="px-4 py-2.5 text-left font-semibold">{t("standings.columnPlayer")}</th>
              {hasPuzzleTimes && (
                <th className="w-24 px-4 py-2.5 text-right font-semibold">
                  {t("standings.columnTime")}
                </th>
              )}
              <th className="w-20 px-4 py-2.5 text-right font-semibold">
                {t("standings.columnPoints")}
              </th>
              <th className="w-24 px-4 py-2.5 text-right font-semibold">
                {t("standings.columnRecord")}
              </th>
              {statColumns.map((column) => (
                <th key={column.key} className="w-24 px-4 py-2.5 text-right font-semibold">
                  {t(`matchStats.stats.${column.labelKey}Short`)}
                </th>
              ))}
              <th className="w-24 px-4 py-2.5 text-right font-semibold">OMW%</th>
              <th className="w-24 px-4 py-2.5 text-right font-semibold">GW%</th>
              <th className="w-24 px-4 py-2.5 text-right font-semibold">
                {t("standings.columnStatus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Fragment key={row.playerId}>
                <tr className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="max-w-0 truncate px-4 py-2.5 font-medium">
                    <Link
                      href={`/tournaments/${tournamentId}/organizer/players/${row.playerId}`}
                      className="hover:underline"
                    >
                      {row.displayName}
                      {row.discriminator && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          #{row.discriminator}
                        </span>
                      )}
                    </Link>
                  </td>
                  {hasPuzzleTimes && (
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {row.puzzleTimeSeconds === undefined
                        ? "—"
                        : formatDuration(row.puzzleTimeSeconds)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{row.matchPoints}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] text-muted-foreground">
                    {row.wins}-{row.losses}-{row.draws}
                  </td>
                  {statColumns.map((column) => (
                    <td
                      key={column.key}
                      className="px-4 py-2.5 text-right font-mono text-[13px] text-muted-foreground"
                    >
                      {/* « — » et non « 0 » : un classement figé avant l'ajout
                          du preset ne porte pas la statistique, et le zéro s'y
                          lirait comme une contre-performance. */}
                      {row.stats?.[column.key] ?? "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] text-muted-foreground">
                    {formatTiebreaker(row.opponentMatchWinPercentage, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] text-muted-foreground">
                    {formatTiebreaker(gameWinPercentage(row.gamesWon, row.gamesLost), locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold">
                    {row.playerStatus === "dropped" ? (
                      <span className="text-destructive">{t("common.playerStatus.dropped")}</span>
                    ) : null}
                  </td>
                </tr>
                {/* Ligne de coupe : matérialise la limite de qualification pour
                    la phase finale, là où elle tombe dans le classement. */}
                {topCut !== undefined && index + 1 === topCut && index + 1 < rows.length && (
                  <tr className="border-b bg-muted/40">
                    <td colSpan={7 + statColumns.length + (hasPuzzleTimes ? 1 : 0)} className="px-4 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          {t("standings.cutLine", { count: topCut })}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7 + statColumns.length + (hasPuzzleTimes ? 1 : 0)} className="px-4 py-4 text-center text-muted-foreground">
                  {t("standings.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
