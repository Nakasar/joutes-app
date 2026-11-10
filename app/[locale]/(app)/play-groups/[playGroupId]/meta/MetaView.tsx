import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ChartLine, Swords } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { domainColor } from "@/lib/meta/domains.ts";
import type { MetaCard } from "@/lib/meta/stats.ts";
import {
  ALL_PERIODS,
  GROUP_META_TABS,
  groupMetaFilterParams,
  readGroupMetaParams,
  type GroupLegendRow,
  type GroupMemberRow,
  type GroupMetaParams,
  type GroupMetaTab,
  type OpponentRow,
  type PairingRow,
} from "@/lib/play-groups/meta.ts";
import { readGroupMeta, type GroupMetaPage } from "@/lib/play-groups/meta-data.ts";
import { cn } from "@/lib/utils.ts";

import { FilterChip, GameIcon, LegendThumb, MemberDot } from "../game-ui.tsx";
import { readGroupMembers, requirePlayGroup, requirePlayGroupMember, type PlayGroupMemberProfile } from "../group-data.ts";
import { viewHref } from "../views.ts";
import { MetaMemberSelect } from "./MetaMemberSelect.tsx";

type Translate = Awaited<ReturnType<typeof getTranslations<"PlayGroups.hub.meta">>>;

type View = {
  t: Translate;
  locale: string;
  playGroupId: string;
  params: GroupMetaParams;
  page: GroupMetaPage;
  nameOf: (userId: string) => string;
  memberById: Map<string, PlayGroupMemberProfile>;
  pct: (value: number) => string;
  href: (patch: Partial<GroupMetaParams>) => string;
};

/**
 * La méta du groupe (`?view=meta`) : ce que les membres jouent en tournoi,
 * comparé à la méta du jeu sur la même période. Les calculs sont dans
 * `lib/play-groups/meta.ts`, la lecture dans `lib/play-groups/meta-data.ts`.
 */
export default async function MetaView({
  playGroupId,
  searchParams,
}: {
  playGroupId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [viewer, group, members, t, locale] = await Promise.all([
    requirePlayGroupMember(playGroupId),
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.meta"),
    getLocale(),
  ]);
  const params = readGroupMetaParams(searchParams);
  const page = await readGroupMeta(
    members.map((member) => member.userId),
    params,
  );

  const memberById = new Map(members.map((member) => [member.userId, member]));
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const view: View = {
    t,
    locale,
    playGroupId,
    params,
    page,
    memberById,
    nameOf: (userId) => (userId === viewer.userId ? t("you") : (memberById.get(userId)?.displayName ?? userId)),
    pct: (value) => percent.format(value),
    href: (patch) =>
      viewHref(playGroupId, "meta", {
        filters: groupMetaFilterParams({ ...params, gameId: params.gameId ?? page.game?.id, ...patch }),
      }),
  };

  if (!page.game) {
    return (
      <div className="flex flex-col gap-5">
        <Header view={view} groupName={group.name} />
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <ChartLine className="size-8 text-[var(--group-accent-text)]" aria-hidden />
          <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Link
            href={viewHref(playGroupId, "tournaments")}
            className="text-sm font-medium text-[var(--group-accent-text)] hover:underline"
          >
            {t("emptyLink")}
          </Link>
        </section>
      </div>
    );
  }

  const { totals } = page.meta;

  return (
    <div className="flex flex-col gap-5">
      <Header view={view} groupName={group.name} />

      <nav aria-label={t("tabs.label")} className="-mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {GROUP_META_TABS.map((tab) => (
          <Link
            key={tab}
            href={view.href({ tab })}
            scroll={false}
            aria-current={tab === params.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent py-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === params.tab && "border-[var(--group-accent)] font-semibold text-foreground",
            )}
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </nav>

      <Filters view={view} />

      {totals.participations === 0 ? (
        <section className="flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("noResultsInPeriod")}</p>
          {page.period && (
            <Link href={view.href({ ext: ALL_PERIODS })} className="text-sm font-medium text-[var(--group-accent-text)] hover:underline">
              {t("showAllPeriods")}
            </Link>
          )}
        </section>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            {[
              t("summary", { participations: totals.participations, tournaments: totals.tournaments }),
              totals.latest
                ? t("latest", { date: DateTime.fromISO(totals.latest).setLocale(view.locale).toLocaleString(DateTime.DATE_MED) })
                : undefined,
              page.matchups.known > 0 ? t("knownMatches", { count: page.matchups.known }) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <TabContent tab={params.tab} view={view} />
        </>
      )}
    </div>
  );
}

function Header({ view, groupName }: { view: View; groupName: string }) {
  const { t, page } = view;
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
        {page.game && (
          <p className="text-sm text-muted-foreground">
            {page.hasMeta
              ? t.rich("subtitleCompared", {
                  group: groupName,
                  game: page.game.name,
                  link: (chunks) => (
                    <Link href={`/games/${page.game?.slug ?? page.game?.id}/meta`} className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                })
              : t("subtitle", { group: groupName, game: page.game.name })}
          </p>
        )}
      </div>
      {page.games.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {page.games.map(({ game, count }) => (
            <FilterChip
              key={game.id}
              href={viewHref(view.playGroupId, "meta", { filters: { jeu: game.id } })}
              active={page.game?.id === game.id}
            >
              <GameIcon game={game} size="sm" />
              {game.name}
              <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
            </FilterChip>
          ))}
        </div>
      )}
    </header>
  );
}

function Filters({ view }: { view: View }) {
  const { t, page, params } = view;
  const day = (value: string) => DateTime.fromISO(value).setLocale(view.locale).toFormat("d LLL");
  const memberOptions = page.memberIds.map((userId) => ({ value: userId, label: view.nameOf(userId) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {page.periods.map((period) => (
        <FilterChip key={period.setCode} href={view.href({ ext: period.setCode })} active={page.period?.setCode === period.setCode}>
          {period.name}
          <span className="text-[11px] text-muted-foreground">{t("since", { date: day(period.from) })}</span>
        </FilterChip>
      ))}
      {page.periods.length > 0 && (
        <FilterChip href={view.href({ ext: ALL_PERIODS })} active={!page.period}>
          {t("allPeriods")}
        </FilterChip>
      )}
      {page.periods.length > 0 && <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />}
      {memberOptions.length > 1 && (
        <MetaMemberSelect
          playGroupId={view.playGroupId}
          params={groupMetaFilterParams({ ...params, gameId: params.gameId ?? page.game?.id })}
          members={memberOptions}
        />
      )}
      {page.hasMeta && (
        <FilterChip href={view.href({ compare: !params.compare })} active={params.compare}>
          <span
            aria-hidden
            className={cn(
              "flex size-3.5 items-center justify-center rounded-[3px] border",
              params.compare && "border-[var(--group-accent)] bg-[var(--group-accent)]",
            )}
          />
          {t("compare")}
        </FilterChip>
      )}
    </div>
  );
}

function TabContent({ tab, view }: { tab: GroupMetaTab; view: View }) {
  switch (tab) {
    case "legends":
      return <LegendsPanel view={view} limit={Infinity} />;
    case "members":
      return <MembersPanel view={view} limit={Infinity} />;
    case "matchups":
      return <MatchupsTab view={view} />;
    case "cards":
      return <CardsTab view={view} />;
    default:
      return <Overview view={view} />;
  }
}

function Overview({ view }: { view: View }) {
  const { t, page, pct } = view;
  const { totals, legends } = page.meta;
  const topThree = legends.slice(0, 3).reduce((sum, legend) => sum + legend.share, 0);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t("kpi.participations")}
          value={String(totals.participations)}
          hint={t("kpi.participationsHint", { count: totals.members, total: view.memberById.size })}
        />
        <Kpi
          label={t("kpi.legends")}
          value={String(legends.length)}
          hint={legends.length > 3 ? t("kpi.legendsHint", { share: pct(topThree) }) : ""}
        />
        <Kpi
          label={t("kpi.topEights")}
          value={String(totals.topEights)}
          hint={t("kpi.topEightsHint", { share: pct(totals.topEights / totals.participations) })}
          gold={totals.topEights > 0}
        />
        <Kpi
          label={t("kpi.winrate")}
          value={totals.rate !== undefined ? pct(totals.rate) : "—"}
          hint={totals.matches > 0 ? t("kpi.winrateHint", { count: totals.matches }) : t("kpi.winrateNone")}
        />
      </dl>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LegendsPanel view={view} limit={6} />
        <div className="flex min-w-0 flex-col gap-4">
          <DomainsPanel view={view} />
          <OpponentsPanel view={view} limit={5} />
        </div>
      </div>

      <MembersPanel view={view} limit={8} />
    </div>
  );
}

function Kpi({ label, value, hint, gold }: { label: string; value: string; hint: string; gold?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card/60 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-bold tracking-tight", gold && "text-[#b8860b] dark:text-[#f2c94c]")}>{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Panel({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card/60 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground sm:ml-auto">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Une barre de part, avec le trait de la méta du jeu. */
function ShareBar({ value, max, marker, color }: { value: number; max: number; marker?: number; color?: string }) {
  const scale = (share: number) => `${Math.min(100, Math.max(0, (share / max) * 100))}%`;
  return (
    <div className="relative h-[7px] rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: scale(value), background: color ?? "var(--group-accent)" }} />
      {marker !== undefined && (
        <div
          aria-hidden
          className="absolute -top-1 h-[15px] w-0.5 rounded-[1px] bg-foreground/75"
          style={{ left: `calc(${scale(marker)} - 1px)` }}
        />
      )}
    </div>
  );
}

function Delta({ view, share, metaShare }: { view: View; share: number; metaShare?: number }) {
  if (metaShare === undefined) return <span className="text-muted-foreground">—</span>;
  const points = Math.round((share - metaShare) * 100);
  return (
    <span className={cn(points > 0 && "text-emerald-600 dark:text-emerald-300", points < 0 && "text-rose-600 dark:text-rose-300")}>
      {view.t("points", { points: points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0" })}
    </span>
  );
}

function DomainDots({ domains }: { domains: string[] }) {
  if (domains.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 gap-1" aria-label={domains.join(", ")}>
      {domains.map((domain) => (
        <span key={domain} className="size-2 rounded-full" style={{ background: domainColor(domain) }} />
      ))}
    </span>
  );
}

function legendRate(view: View, legend: { rate?: number; matches: number }) {
  return legend.rate !== undefined ? view.pct(legend.rate) : "—";
}

function LegendsPanel({ view, limit }: { view: View; limit: number }) {
  const { t, page } = view;
  const legends = page.meta.legends;
  const shown = legends.slice(0, limit);
  const max = Math.max(...legends.map((legend) => Math.max(legend.share, legend.metaShare ?? 0)), 0.01);

  return (
    <Panel
      title={t("legends.title")}
      hint={
        page.compared ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-0.5 bg-foreground/75" />
            {t("legends.marker")}
          </span>
        ) : undefined
      }
    >
      {legends.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("legends.none")}</p>
      ) : (
        <>
          <div
            className={cn(
              "hidden gap-3 text-[11px] text-muted-foreground sm:grid",
              page.compared ? "sm:grid-cols-[40px_minmax(0,1fr)_48px_64px_44px_52px]" : "sm:grid-cols-[40px_minmax(0,1fr)_48px_44px_52px]",
            )}
          >
            <span />
            <span>{t("legends.share")}</span>
            <span className="text-right">{t("legends.group")}</span>
            {page.compared && <span className="text-right">{t("legends.vsMeta")}</span>}
            <span className="text-right">{t("legends.topEights")}</span>
            <span className="text-right">{t("legends.winrate")}</span>
          </div>
          <ul className="flex flex-col gap-3">
            {shown.map((legend) => (
              <LegendRow key={legend.key} view={view} legend={legend} max={max} />
            ))}
          </ul>
          {legends.length > shown.length && (
            <Link href={view.href({ tab: "legends" })} scroll={false} className="text-sm text-[var(--group-accent-text)] hover:underline">
              {t("legends.more", { count: legends.length - shown.length })}
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

function LegendRow({ view, legend, max }: { view: View; legend: GroupLegendRow; max: number }) {
  const { t, page, pct } = view;
  const players = legend.userIds.slice(0, 3).map(view.nameOf).join(", ");
  return (
    <li
      className={cn(
        "grid grid-cols-[40px_minmax(0,1fr)_48px] items-center gap-3",
        page.compared ? "sm:grid-cols-[40px_minmax(0,1fr)_48px_64px_44px_52px]" : "sm:grid-cols-[40px_minmax(0,1fr)_48px_44px_52px]",
      )}
    >
      <Thumb src={legend.image} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{legend.name}</span>
          <DomainDots domains={legend.domains} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {t("legends.detail", { count: legend.decks, players })}
          <span className="sm:hidden">
            {" · "}
            {t("legends.topEightsShort", { count: legend.topCuts })}
            {legend.rate !== undefined ? ` · ${pct(legend.rate)}` : ""}
            {page.compared && legend.metaShare !== undefined && (
              <>
                {" · "}
                <Delta view={view} share={legend.share} metaShare={legend.metaShare} />
              </>
            )}
          </span>
        </span>
        <ShareBar value={legend.share} max={max} marker={page.compared ? legend.metaShare : undefined} />
      </span>
      <span className="text-right font-mono text-sm">{pct(legend.share)}</span>
      {page.compared && (
        <span className="hidden text-right font-mono text-[13px] sm:block">
          <Delta view={view} share={legend.share} metaShare={legend.metaShare} />
        </span>
      )}
      <span className="hidden text-right font-mono text-sm sm:block">{legend.topCuts}</span>
      <span className="hidden text-right font-mono text-sm sm:block">{legendRate(view, legend)}</span>
    </li>
  );
}

function Thumb({ src, small }: { src?: string; small?: boolean }) {
  const size = small ? "h-7 w-5" : "h-14 w-10";
  if (!src) return <span aria-hidden className={cn("shrink-0 rounded border bg-muted", size)} />;
  return (
    <span className={cn("shrink-0 overflow-hidden rounded border", size)}>
      {/* Les images de cartes viennent de plusieurs hôtes : `next/image` les refuserait. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="size-full object-cover object-top" />
    </span>
  );
}

function DomainsPanel({ view }: { view: View }) {
  const { t, page, pct } = view;
  const { domains, overview } = page.meta;
  if (domains.length === 0) return null;
  const max = Math.max(...domains.map((domain) => Math.max(domain.share, domain.metaShare ?? 0)), 0.01);

  return (
    <Panel title={t("domains.title")} hint={t("domains.hint")}>
      <ul className="flex flex-col gap-2.5">
        {domains.map((domain) => (
          <li key={domain.domain} className="grid grid-cols-[76px_minmax(0,1fr)_44px] items-center gap-3">
            <span className="flex items-center gap-2 text-[13px]">
              <span aria-hidden className="size-2 rounded-full" style={{ background: domainColor(domain.domain) }} />
              {domain.domain}
            </span>
            <ShareBar value={domain.share} max={max} marker={page.compared ? domain.metaShare : undefined} color={domainColor(domain.domain)} />
            <span className="text-right font-mono text-[13px]">{pct(domain.share)}</span>
          </li>
        ))}
      </ul>
      {overview.topPair && (
        <p className="border-t pt-3 text-[13px] text-muted-foreground">
          {t.rich("domains.topPair", {
            pair: overview.topPair.domains.join(" + "),
            share: pct(overview.topPair.share),
            strong: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
        </p>
      )}
    </Panel>
  );
}

function OpponentsPanel({ view, limit }: { view: View; limit: number }) {
  const { t, page } = view;
  const rows = page.matchups.opponents.slice(0, limit);

  return (
    <Panel title={t("matchups.title")} hint={t("matchups.hint")}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("matchups.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <OpponentLine key={row.cardId ?? row.legend} view={view} row={row} cards={page.cards} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("matchups.footnote")}</p>
      {page.matchups.opponents.length > rows.length && (
        <Link href={view.href({ tab: "matchups" })} scroll={false} className="text-sm text-[var(--group-accent-text)] hover:underline">
          {t("matchups.more", { count: page.matchups.opponents.length - rows.length })}
        </Link>
      )}
    </Panel>
  );
}

/** Le winrate contre une légende : une barre qui part du milieu, verte au-dessus de 50 %, rouge en dessous. */
function RateBar({ rate }: { rate?: number }) {
  if (rate === undefined) return <div className="h-[7px] rounded-full bg-muted" />;
  const offset = Math.abs(rate - 0.5) * 100;
  return (
    <div className="relative h-[7px] rounded-full bg-muted">
      <div
        className={cn("absolute top-0 h-full rounded-full", rate >= 0.5 ? "bg-emerald-500/80" : "bg-rose-500/80")}
        style={rate >= 0.5 ? { left: "50%", width: `${offset}%` } : { left: `${50 - offset}%`, width: `${offset}%` }}
      />
      <div aria-hidden className="absolute -top-1 left-1/2 h-[15px] w-px bg-foreground/50" />
    </div>
  );
}

function rateClass(rate?: number) {
  if (rate === undefined) return "text-muted-foreground";
  return rate > 0.5 ? "text-emerald-600 dark:text-emerald-300" : rate < 0.5 ? "text-rose-600 dark:text-rose-300" : undefined;
}

function OpponentLine({ view, row, cards }: { view: View; row: OpponentRow; cards: Record<string, MetaCard> }) {
  const { t, pct } = view;
  const name = (row.cardId && cards[row.cardId]?.name) || row.legend;
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)_minmax(60px,96px)_44px] items-center gap-3">
      <LegendThumb image={row.cardId ? cards[row.cardId]?.image : undefined} />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[13px]">{name.split(",")[0]}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t("matchups.matches", { count: row.matches })}</span>
      </span>
      <RateBar rate={row.rate} />
      <span className={cn("text-right font-mono text-[13px]", rateClass(row.rate))}>{row.rate !== undefined ? pct(row.rate) : "—"}</span>
    </li>
  );
}

function MatchupsTab({ view }: { view: View }) {
  const { t, page, pct } = view;
  const { opponents, pairings, counted } = page.matchups;

  if (counted === 0) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-6 py-10 text-center">
        <Swords className="size-7 text-muted-foreground" aria-hidden />
        <p className="max-w-md text-sm text-muted-foreground">{t("matchups.emptyTab")}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title={t("matchups.opponentsTitle")} hint={t("matchups.counted", { count: counted })}>
        <ul className="flex flex-col gap-2">
          {opponents.map((row) => (
            <OpponentLine key={row.cardId ?? row.legend} view={view} row={row} cards={page.cards} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("matchups.footnote")}</p>
      </Panel>
      <Panel title={t("matchups.pairingsTitle")} hint={t("matchups.pairingsHint")}>
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="py-1.5 font-normal">{t("matchups.mine")}</th>
                <th className="py-1.5 font-normal">{t("matchups.theirs")}</th>
                <th className="py-1.5 text-right font-normal">{t("matchups.record")}</th>
                <th className="py-1.5 text-right font-normal">{t("legends.winrate")}</th>
              </tr>
            </thead>
            <tbody>
              {pairings.map((row: PairingRow) => (
                <tr key={`${row.legend}|${row.opponent}`} className="border-t">
                  <td className="py-2 pr-3">{(row.legendCardId && page.cards[row.legendCardId]?.name?.split(",")[0]) || row.legend.split(",")[0]}</td>
                  <td className="py-2 pr-3">{(row.opponentCardId && page.cards[row.opponentCardId]?.name?.split(",")[0]) || row.opponent.split(",")[0]}</td>
                  <td className="py-2 text-right font-mono">{`${row.wins}-${row.losses}-${row.draws}`}</td>
                  <td className={cn("py-2 text-right font-mono", rateClass(row.rate))}>{row.rate !== undefined ? pct(row.rate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function placementLabel(t: Translate, placement: number) {
  return t("placement", { place: placement });
}

function MembersPanel({ view, limit }: { view: View; limit: number }) {
  const { t, page, pct } = view;
  const rows = page.meta.members.slice(0, limit);
  const legendByKey = new Map(page.meta.legends.map((legend) => [legend.key, legend]));

  return (
    <Panel
      title={t("members.title")}
      hint={page.period ? t("members.onPeriod", { period: page.period.name }) : t("members.allTime")}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="py-1.5 font-normal">{t("members.member")}</th>
              <th className="py-1.5 pl-3 text-right font-normal">{t("members.tournaments")}</th>
              <th className="py-1.5 pl-3 text-right font-normal">{t("members.topEights")}</th>
              <th className="py-1.5 pl-3 text-right font-normal">{t("members.best")}</th>
              <th className="py-1.5 pl-3 text-right font-normal">{t("legends.winrate")}</th>
              <th className="py-1.5 pl-4 font-normal">{t("members.legends")}</th>
              <th className="py-1.5 font-normal">{t("members.last")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: GroupMemberRow) => {
              const member = view.memberById.get(row.userId);
              const name = view.nameOf(row.userId);
              return (
                <tr key={row.userId} className="border-t">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <MemberDot name={member?.displayName ?? name} avatar={member?.avatar} />
                      {name}
                    </span>
                  </td>
                  <td className="py-2 pl-3 text-right font-mono">{row.tournaments}</td>
                  <td className="py-2 pl-3 text-right font-mono">{row.topEights}</td>
                  <td className={cn("py-2 pl-3 text-right font-mono", row.best === 1 && "text-[#b8860b] dark:text-[#f2c94c]")}>
                    {row.best !== undefined ? placementLabel(t, row.best) : "—"}
                  </td>
                  <td className="py-2 pl-3 text-right font-mono">{row.rate !== undefined ? pct(row.rate) : "—"}</td>
                  <td className="py-2 pl-4">
                    <span className="inline-flex gap-1">
                      {row.legends.slice(0, 3).map((key) => {
                        const legend = legendByKey.get(key);
                        return (
                          <span key={key} title={legend?.name ?? key}>
                            <LegendThumb image={legend?.image} />
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate py-2 text-muted-foreground">
                    {row.last
                      ? [row.last.placement !== undefined ? placementLabel(t, row.last.placement) : t("members.unranked"), row.last.name].join(" · ")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {page.meta.members.length > rows.length && (
        <Link href={view.href({ tab: "members" })} scroll={false} className="text-sm text-[var(--group-accent-text)] hover:underline">
          {t("members.more", { count: page.meta.members.length - rows.length })}
        </Link>
      )}
    </Panel>
  );
}

function CardsTab({ view }: { view: View }) {
  const { t, page, pct } = view;
  const stats = page.cardStats.slice(0, 60);

  if (page.withCards === 0) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-6 py-10 text-center">
        <p className="max-w-md text-sm text-muted-foreground">{t("cards.empty")}</p>
      </section>
    );
  }

  return (
    <Panel title={t("cards.title")} hint={t("cards.hint", { count: page.withCards })}>
      <ul className="divide-y">
        {stats.map((stat, index) => (
          <li key={stat.name} className="grid grid-cols-[24px_20px_minmax(0,1fr)_44px] items-center gap-3 py-2 sm:grid-cols-[24px_20px_minmax(0,1fr)_minmax(80px,160px)_44px_auto]">
            <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
            <LegendThumb image={stat.image} />
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-medium">{stat.name}</span>
              <DomainDots domains={stat.domains} />
            </span>
            <span className="hidden sm:block">
              <ShareBar value={stat.share} max={1} />
            </span>
            <span className="text-right font-mono text-[13px]">{pct(stat.share)}</span>
            <span className="hidden whitespace-nowrap text-right font-mono text-xs text-muted-foreground sm:block">
              {t("cards.copies", { copies: stat.averageCopies.toFixed(1) })}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
