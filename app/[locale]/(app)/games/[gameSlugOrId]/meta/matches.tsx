import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation.ts";
import { domainColor } from "@/lib/meta/domains.ts";
import {
  MIN_MATCHES_FOR_RATE,
  recordMatches,
  shortLegendName,
  winrate,
  type DomainWinrate,
  type FacedLegend,
  type LegendWinrate,
  type MatchRecord,
  type MetaEventPlayer,
  type PlayerRound,
} from "@/lib/meta/match-stats.ts";
import { cn } from "@/lib/utils.ts";
import { LegendThumb } from "./charts.tsx";
import { MatchupPicker, type MatchupPickerRow } from "./MatchupPicker.tsx";

/**
 * Les blocs des matchs, communs à la page d'un tournoi et à l'onglet
 * Winrates de la méta du jeu : winrates par légende et par domaine,
 * matchups, légendes affrontées.
 */

type T = Awaited<ReturnType<typeof getTranslations>>;
export type RateFormat = (value: number) => string;

/** Au-delà, les légendes les moins jouées sortent de la grille des matchups (elles restent dans le tableau). */
const MATCHUP_LEGENDS = 10;

export function MatchPanel({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      {children}
    </section>
  );
}

function Title({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Le choix des phases comptées : rondes suisses seules, ou avec le top. */
export function PhaseToggle({ t, includeTop, href }: { t: T; includeTop: boolean; href: (includeTop: boolean) => string }) {
  const option = (value: boolean, label: string) => (
    <Link
      href={href(value)}
      scroll={false}
      aria-current={includeTop === value ? "true" : undefined}
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 text-sm whitespace-nowrap",
        includeTop === value ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label={t("matches.phase.label")} className="inline-flex gap-1 rounded-full bg-muted p-1">
      {option(false, t("matches.phase.swiss"))}
      {option(true, t("matches.phase.withTop"))}
    </nav>
  );
}

function Domains({ domains }: { domains: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-2.5 text-xs text-muted-foreground">
      {domains.map((domain) => (
        <span key={domain} className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
          {domain}
        </span>
      ))}
    </span>
  );
}

function recordLabel(record: MatchRecord): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

/** Une barre de winrate, avec le trait des 50 %. */
function RateBar({ rate, few }: { rate?: number; few: boolean }) {
  return (
    <span className="relative block h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
      <span
        className={cn("block h-full rounded-full", few ? "bg-slate-300 dark:bg-slate-600" : rate !== undefined && rate >= 0.5 ? "bg-primary" : "bg-orange-400")}
        style={{ width: `${(rate ?? 0) * 100}%` }}
      />
      <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" aria-hidden />
    </span>
  );
}

export function LegendWinratesPanel({
  t,
  rows,
  rate,
  toggle,
  showTop8 = true,
  unknownPlayers = 0,
}: {
  t: T;
  rows: LegendWinrate[];
  rate: RateFormat;
  toggle?: React.ReactNode;
  showTop8?: boolean;
  /** Joueurs sans légende connue, qui ne comptent pas. */
  unknownPlayers?: number;
}) {
  const columns = showTop8
    ? "sm:grid-cols-[minmax(0,1.4fr)_4rem_4rem_6rem_minmax(0,1.6fr)_3.5rem]"
    : "sm:grid-cols-[minmax(0,1.4fr)_4rem_4rem_6rem_minmax(0,1.6fr)]";
  return (
    <MatchPanel>
      <Title title={t("matches.legends.title")}>{toggle}</Title>
      <div className="flex flex-col">
        <div className={cn("hidden gap-3 pb-2 text-xs font-medium text-muted-foreground sm:grid", columns)}>
          <span>{t("matches.legends.legend")}</span>
          <span className="text-right">{t("matches.legends.players")}</span>
          <span className="text-right">{t("matches.legends.matches")}</span>
          <span className="text-right">{t("matches.legends.record")}</span>
          <span>{t("matches.legends.rate")}</span>
          {showTop8 && <span className="text-right">{t("matches.legends.top8")}</span>}
        </div>
        <ul className="flex flex-col">
          {rows.map((row) => {
            const few = row.matches < MIN_MATCHES_FOR_RATE;
            return (
              <li
                key={row.legend}
                className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-border py-2.5 text-sm", columns)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <LegendThumb src={row.legendImage} className="h-11 w-8" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold" title={row.legend}>
                      {shortLegendName(row.legend)}
                    </span>
                    <Domains domains={row.domains} />
                  </span>
                </span>
                <span className="text-right font-mono tabular-nums text-muted-foreground sm:text-foreground">
                  <span className="sm:hidden">
                    {t("matches.legends.mobileCounts", { players: row.players, matches: row.matches })}
                  </span>
                  <span className="hidden sm:inline">{row.players}</span>
                </span>
                <span className="hidden text-right font-mono tabular-nums sm:block">{row.matches}</span>
                <span className="hidden text-right font-mono tabular-nums text-muted-foreground sm:block">{recordLabel(row)}</span>
                <span className={cn("col-span-2 flex items-center gap-2 sm:col-span-1", few && "text-muted-foreground")}>
                  <RateBar rate={row.rate} few={few} />
                  <span className="w-14 text-right font-mono font-semibold tabular-nums">{row.rate !== undefined ? rate(row.rate) : "—"}</span>
                  {few && <span className="hidden w-24 text-xs lg:inline">{t("matches.legends.few")}</span>}
                </span>
                {showTop8 && (
                  <span className="hidden text-right font-mono tabular-nums sm:block">{row.top8 > 0 ? row.top8 : "–"}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("matches.legends.hint", { min: MIN_MATCHES_FOR_RATE })}
        {unknownPlayers > 0 && <> {t("matches.legends.unknown", { count: unknownPlayers })}</>}
      </p>
    </MatchPanel>
  );
}

export function DomainWinratesPanel({ t, rows, rate }: { t: T; rows: DomainWinrate[]; rate: RateFormat }) {
  return (
    <MatchPanel>
      <Title title={t("matches.domains.title")} />
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const few = row.matches < MIN_MATCHES_FOR_RATE;
          return (
            <li key={row.domain} className="flex flex-col gap-1.5 text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-sm" style={{ background: domainColor(row.domain) }} aria-hidden />
                  {row.domain}
                </span>
                <span className={cn("font-mono tabular-nums text-muted-foreground", few && "opacity-70")}>
                  {t("matches.domains.rate", { rate: row.rate !== undefined ? rate(row.rate) : "—", matches: row.matches })}
                </span>
              </span>
              <RateBar rate={row.rate} few={few} />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("matches.domains.hint")}</p>
    </MatchPanel>
  );
}

/** La couleur d'une case de matchup : bleu favorable, orange défavorable, pâle sans assez de matchs. */
function cellStyle(rate: number | undefined, matches: number): { className: string; style?: React.CSSProperties } {
  if (rate === undefined || matches === 0) return { className: "bg-muted/40 text-muted-foreground" };
  if (matches < MIN_MATCHES_FOR_RATE) return { className: "bg-muted/70 text-muted-foreground" };
  const strength = Math.max(-1, Math.min(1, (rate - 0.5) / 0.18));
  const alpha = (0.12 + Math.abs(strength) * 0.7).toFixed(2);
  return {
    className: Math.abs(strength) > 0.55 ? "text-white" : "text-foreground",
    style: { background: strength >= 0 ? `rgb(11 109 158 / ${alpha})` : `rgb(194 65 12 / ${alpha})` },
  };
}

export function MatchupsPanel({
  t,
  legends,
  matchups,
  rate,
}: {
  t: T;
  /** Dans l'ordre d'affichage, les plus jouées d'abord. */
  legends: LegendWinrate[];
  matchups: Map<string, Map<string, MatchRecord>>;
  rate: RateFormat;
}) {
  const shown = legends
    .slice()
    .sort((a, b) => b.matches - a.matches)
    .slice(0, MATCHUP_LEGENDS)
    .filter((legend) => matchups.has(legend.legend));
  if (shown.length < 2) return null;
  const percent = (value: number) => `${Math.round(value * 100)} %`;

  const pickerRows: MatchupPickerRow[] = shown.map((legend) => ({
    legend: shortLegendName(legend.legend),
    image: legend.legendImage,
    opponents: [...(matchups.get(legend.legend) ?? new Map<string, MatchRecord>())]
      .map(([opponent, record]) => ({
        legend: shortLegendName(opponent),
        image: legends.find((row) => row.legend === opponent)?.legendImage,
        matches: recordMatches(record),
        record: recordLabel(record),
        rate: winrate(record) ?? 0,
        rateLabel: rate(winrate(record) ?? 0),
      }))
      .sort((a, b) => b.matches - a.matches),
  }));

  return (
    <MatchPanel>
      <Title title={t("matches.matchups.title")} hint={t("matches.matchups.hint")} />

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="w-40 text-left font-medium">
                {t("matches.matchups.against")}
              </th>
              {shown.map((column) => (
                <th key={column.legend} scope="col" className="px-1 py-1 font-medium">
                  <span className="flex flex-col items-center gap-1">
                    <LegendThumb src={column.legendImage} className="h-8 w-6" />
                    <span className="max-w-16 truncate text-foreground" title={column.legend}>
                      {shortLegendName(column.legend)}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((line) => (
              <tr key={line.legend}>
                <th scope="row" className="py-0.5 pr-2 text-left font-medium">
                  <span className="flex min-w-0 items-center gap-2">
                    <LegendThumb src={line.legendImage} className="h-8 w-6" />
                    <span className="truncate" title={line.legend}>
                      {shortLegendName(line.legend)}
                    </span>
                  </span>
                </th>
                {shown.map((column) => {
                  if (column.legend === line.legend) {
                    return (
                      <td key={column.legend} className="h-11 rounded-md bg-muted/30 text-center text-xs text-muted-foreground">
                        {t("matches.matchups.mirror")}
                      </td>
                    );
                  }
                  const record = matchups.get(line.legend)?.get(column.legend);
                  const matches = record ? recordMatches(record) : 0;
                  const value = record ? winrate(record) : undefined;
                  const look = cellStyle(value, matches);
                  return (
                    <td
                      key={column.legend}
                      className={cn("h-11 rounded-md text-center leading-tight tabular-nums", look.className)}
                      style={look.style}
                      title={record ? `${shortLegendName(line.legend)} – ${shortLegendName(column.legend)} : ${recordLabel(record)}` : undefined}
                    >
                      {value !== undefined ? (
                        <>
                          <span className="block font-semibold">{percent(value)}</span>
                          <span className="block text-[11px] opacity-80">{t("matches.matchups.short", { count: matches })}</span>
                        </>
                      ) : (
                        "·"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden">
        <MatchupPicker
          rows={pickerRows}
          min={MIN_MATCHES_FOR_RATE}
          labels={{ pick: t("matches.matchups.pick"), versus: t("matches.matchups.versus"), few: t("matches.legends.few") }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          {t("matches.matchups.unfavorable")}
          <span
            className="h-2.5 w-24 rounded-full"
            style={{ background: "linear-gradient(90deg, rgb(194 65 12 / 0.8), rgb(194 65 12 / 0.12), rgb(11 109 158 / 0.12), rgb(11 109 158 / 0.8))" }}
            aria-hidden
          />
          {t("matches.matchups.favorable")}
        </span>
        <span>{t("matches.matchups.few", { min: MIN_MATCHES_FOR_RATE })}</span>
        {legends.length > shown.length && <span>{t("matches.matchups.more", { count: shown.length })}</span>}
      </div>
    </MatchPanel>
  );
}

/** Les légendes rencontrées, en barres victoires / défaites / nuls. */
export function FacedLegendsList({ t, rows }: { t: T; rows: FacedLegend[] }) {
  const max = Math.max(1, ...rows.map((row) => row.matches));
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.legend} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <LegendThumb src={row.legendImage} className="h-8 w-6" />
              <span className="truncate font-medium" title={row.legend}>
                {shortLegendName(row.legend)}
              </span>
            </span>
            <span className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="h-full bg-primary" style={{ width: `${(row.wins / max) * 100}%` }} />
              <span className="h-full bg-slate-400" style={{ width: `${(row.draws / max) * 100}%` }} />
              <span className="h-full bg-orange-400" style={{ width: `${(row.losses / max) * 100}%` }} />
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {t("matches.faced.record", { matches: row.matches, record: recordLabel(row) })}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
          {t("matches.faced.wins")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-orange-400" aria-hidden />
          {t("matches.faced.losses")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-400" aria-hidden />
          {t("matches.faced.draws")}
        </span>
      </div>
    </div>
  );
}

const RESULT_BORDER: Record<PlayerRound["result"], string> = {
  W: "border-b-primary",
  L: "border-b-orange-400",
  D: "border-b-slate-400",
  BYE: "border-b-transparent",
};

/** Une case par ronde : la légende adverse, soulignée selon le résultat. */
export function RoundStrip({ t, rounds }: { t: T; rounds: PlayerRound[] }) {
  return (
    <ol className="flex flex-wrap gap-1">
      {rounds.map((round) => {
        const label =
          round.result === "BYE"
            ? t("matches.player.results.BYE")
            : `${t(`matches.player.results.${round.result}`)} · ${round.opponent?.legend ? shortLegendName(round.opponent.legend) : (round.opponent?.name ?? "?")}`;
        return (
          <li
            key={`${round.phase}-${round.round}`}
            title={`${t("matches.player.roundShort", { round: round.round })} · ${label}`}
            className={cn("flex size-7 items-center justify-center overflow-hidden rounded-md border-b-[3px] bg-muted", RESULT_BORDER[round.result])}
          >
            {round.result === "BYE" ? (
              <span className="text-[10px] font-semibold text-muted-foreground">{t("matches.player.byeShort")}</span>
            ) : round.opponent?.legendImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={round.opponent.legendImage} alt="" loading="lazy" className="size-full object-cover object-top" />
            ) : (
              <span className="text-[10px] font-semibold">{(round.opponent?.legend ?? "?").slice(0, 2).toUpperCase()}</span>
            )}
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Le nom d'un joueur et sa légende, en lien vers son parcours. */
export function PlayerLink({ player, href }: { player: MetaEventPlayer; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5 hover:underline">
      <LegendThumb src={player.legendImage} className="h-9 w-7" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{player.name}</span>
        {player.legend && <span className="truncate text-xs text-muted-foreground">{shortLegendName(player.legend)}</span>}
      </span>
    </Link>
  );
}
