import { getTranslations } from "next-intl/server";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import {
  domainWinrates,
  eventsBetween,
  legendMatchups,
  legendWinrates,
  matchTotals,
  type MetaEventMatches,
} from "@/lib/meta/match-stats.ts";
import { currentSetPeriod, setPeriods } from "@/lib/meta/set-periods.ts";
import { tournamentPath } from "@/lib/meta/tournaments.ts";
import { cn } from "@/lib/utils.ts";
import { DomainWinratesPanel, LegendWinratesPanel, MatchPanel, MatchupsPanel, PhaseToggle } from "./matches.tsx";
import { WinrateDatesForm } from "./WinrateDatesForm.tsx";

type T = Awaited<ReturnType<typeof getTranslations>>;
type RawParams = Record<string, string | string[] | undefined>;

const MODES = ["set", "all", "dates"] as const;
type WinrateMode = (typeof MODES)[number];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/**
 * L'onglet Winrates de la méta d'un jeu : les matchs de tous ses tournois
 * importés avec leurs matchs, sur l'extension en cours (par défaut), sur tout
 * l'historique, ou entre deux dates.
 */
export function WinratesTab({
  t,
  locale,
  basePath,
  raw,
  events,
  releases,
  setNames,
}: {
  t: T;
  locale: string;
  basePath: string;
  raw: RawParams;
  events: MetaEventMatches[];
  releases: Record<string, string>;
  setNames: Record<string, string>;
}) {
  const periods = setPeriods(releases, setNames);
  const today = new Date().toISOString().slice(0, 10);
  const requestedMode = first(raw.wr);
  const mode: WinrateMode = MODES.includes(requestedMode as WinrateMode)
    ? (requestedMode as WinrateMode)
    : periods.length > 0
      ? "set"
      : "all";
  const period =
    mode === "set" ? (periods.find((candidate) => candidate.setCode === first(raw.ext)) ?? currentSetPeriod(periods, today)) : undefined;
  const from = mode === "set" ? period?.from : mode === "dates" ? first(raw.du)?.match(DAY)?.[0] : undefined;
  const to = mode === "set" ? period?.to : mode === "dates" ? first(raw.au)?.match(DAY)?.[0] : undefined;
  const includeTop = first(raw.phases) === "top";

  const counted = eventsBetween(events, from, to);
  const filter = { includeTop };
  const legends = legendWinrates(counted, filter);
  const domains = domainWinrates(counted, filter);
  const matchups = legendMatchups(counted, filter);
  const totals = matchTotals(counted);
  const rateFormat = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rate = (value: number) => rateFormat.format(value);
  const day = (value: string) => DateTime.fromISO(value, { zone: "utc" }).setLocale(locale).toLocaleString(DateTime.DATE_MED);

  const query = (overrides: { mode?: WinrateMode; ext?: string; includeTop?: boolean; from?: string; to?: string }) => {
    const params = new URLSearchParams({ tab: "winrates" });
    const nextMode = overrides.mode ?? mode;
    if (nextMode !== (periods.length > 0 ? "set" : "all")) params.set("wr", nextMode);
    const ext = "ext" in overrides ? overrides.ext : period?.setCode;
    if (nextMode === "set" && ext && ext !== currentSetPeriod(periods, today)?.setCode) params.set("ext", ext);
    if (nextMode === "dates") {
      const start = "from" in overrides ? overrides.from : from;
      const end = "to" in overrides ? overrides.to : to;
      if (start) params.set("du", start);
      if (end) params.set("au", end);
    }
    if (overrides.includeTop ?? includeTop) params.set("phases", "top");
    return `${basePath}?${params.toString()}`;
  };

  const modeLink = (value: WinrateMode) => (
    <Link
      key={value}
      href={query({ mode: value, ext: undefined, from: undefined, to: undefined })}
      scroll={false}
      aria-current={mode === value ? "true" : undefined}
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 text-sm whitespace-nowrap",
        mode === value ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {t(`matches.winrates.modes.${value}`)}
    </Link>
  );

  const range =
    from && to ? t("matches.winrates.between", { from: day(from), to: day(to) }) : from ? t("matches.winrates.since", { from: day(from) }) : to ? t("matches.winrates.until", { to: day(to) }) : t("matches.winrates.allTime");

  return (
    <div className="flex flex-col gap-5">
      <MatchPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("matches.winrates.modes.label")} className="inline-flex gap-1 rounded-full bg-muted p-1">
            {MODES.map(modeLink)}
          </nav>
          <PhaseToggle t={t} includeTop={includeTop} href={(value) => query({ includeTop: value })} />
        </div>

        {mode === "set" &&
          (periods.length > 0 ? (
            <nav aria-label={t("matches.winrates.sets")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {periods.map((candidate) => (
                <Link
                  key={candidate.setCode}
                  href={query({ ext: candidate.setCode })}
                  scroll={false}
                  aria-current={candidate.setCode === period?.setCode ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
                    candidate.setCode === period?.setCode ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  )}
                >
                  {candidate.name}
                  <span className="text-xs text-muted-foreground">{t("matches.winrates.sinceShort", { from: day(candidate.from) })}</span>
                </Link>
              ))}
            </nav>
          ) : (
            <p className="text-sm text-muted-foreground">{t("matches.winrates.noReleases")}</p>
          ))}

        {mode === "dates" && (
          <WinrateDatesForm
            href={query({ mode: "dates", from: undefined, to: undefined })}
            from={from}
            to={to}
            labels={{ from: t("matches.winrates.from"), to: t("matches.winrates.to"), apply: t("matches.winrates.apply") }}
          />
        )}

        <p className="text-sm text-muted-foreground">
          {range} · {t("matches.winrates.summary", { events: counted.length, matches: totals.matches })}
        </p>
      </MatchPanel>

      {counted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-muted-foreground">
          {t("matches.winrates.empty")}
        </p>
      ) : (
        <>
          <LegendWinratesPanel t={t} rows={legends} rate={rate} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <DomainWinratesPanel t={t} rows={domains} rate={rate} />
            <MatchupsPanel t={t} legends={legends} matchups={matchups} rate={rate} />
          </div>
          <MatchPanel>
            <h2 className="text-base font-semibold">{t("matches.winrates.events", { count: counted.length })}</h2>
            <ul className="flex flex-col">
              {counted.map((event) => {
                const eventTotals = matchTotals([event]);
                return (
                  <li key={event.id} className="border-t border-border first:border-t-0">
                    <Link
                      href={`${tournamentPath(basePath, event.source, event.eventDate)}?vue=matchs`}
                      className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm hover:underline"
                    >
                      <span className="font-semibold">{event.source}</span>
                      <span className="text-muted-foreground">
                        {day(event.eventDate.slice(0, 10))} ·{" "}
                        {t("matches.summary", { players: event.players.length, rounds: eventTotals.rounds, matches: eventTotals.matches })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </MatchPanel>
        </>
      )}
    </div>
  );
}
