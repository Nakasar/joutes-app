import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { CalendarClock, ChevronDown, Info, Lock, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { getDeckSummariesByIds } from "@/lib/db/decks.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { listPlayGroupDecks } from "@/lib/db/play-group-decks.ts";
import { listResultsForUsers } from "@/lib/db/tournament-results.ts";
import {
  buildGroupTimeline,
  groupLegends,
  groupPalmares,
  groupTournamentFilterParams,
  readGroupTournamentFilters,
} from "@/lib/play-groups/tournaments.ts";
import { listUpcomingRegistrations } from "@/lib/tournaments/result-service.ts";
import { formatRecord, type TimelineTournament } from "@/lib/tournaments/results.ts";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import { cn } from "@/lib/utils.ts";

import { readGroupMembers, requirePlayGroupMember, type PlayGroupMemberProfile } from "../group-data.ts";
import { viewHref } from "../views.ts";
import { DeclareResultDialog } from "./DeclareResultDialog.tsx";
import { MyResultMenu } from "./MyResultMenu.tsx";
import { TournamentFilterBar } from "./TournamentFilterBar.tsx";

export type TournamentSearchParams = Record<string, string | string[] | undefined>;

type DeckLink = { name: string; version?: number; href?: string };

/**
 * Les tournois des membres (`?view=tournaments`) : leurs résultats, réunis par
 * tournoi puis par mois. Un membre apporte tout son historique ; un ancien
 * membre n'apporte plus rien. Tout membre voit tout : un résultat « groupes »
 * est fait pour les groupes que l'on partage, et c'en est un.
 */
export default async function TournamentsView({
  playGroupId,
  searchParams,
}: {
  playGroupId: string;
  searchParams: TournamentSearchParams;
}) {
  const [viewer, members, games, t, locale] = await Promise.all([
    requirePlayGroupMember(playGroupId),
    readGroupMembers(playGroupId),
    readAllGames(),
    getTranslations("PlayGroups.hub.tournaments"),
    getLocale(),
  ]);

  const memberIds = members.map((member) => member.userId);
  const [results, upcoming, groupDecks] = await Promise.all([
    listResultsForUsers(memberIds),
    listUpcomingRegistrations(memberIds),
    listPlayGroupDecks(playGroupId),
  ]);

  const filters = readGroupTournamentFilters(searchParams);
  const params = groupTournamentFilterParams(filters);
  const hrefWith = (patch: Record<string, string | undefined>) =>
    viewHref(playGroupId, "tournaments", { filters: { ...params, avant: undefined, ...patch } });

  const gameName = new Map(games.map((game) => [game.id, game.name]));
  const gameCounts = new Map<string, number>();
  for (const result of results) {
    if (result.gameId) gameCounts.set(result.gameId, (gameCounts.get(result.gameId) ?? 0) + 1);
  }
  const inGame = filters.gameId ? results.filter((result) => result.gameId === filters.gameId) : results;
  const timeline = buildGroupTimeline(results, filters);
  const palmares = groupPalmares(inGame).slice(0, 5);
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const nameOf = (userId: string) =>
    userId === viewer.userId ? t("you") : (memberById.get(userId)?.displayName ?? userId);

  // Ce que la page montre : les vignettes de légende et les decks liés, lus une fois.
  const shown = timeline.months.flatMap((month) => month.tournaments.flatMap((tournament) => tournament.results));
  const legendIdsByGame = new Map<string, Set<string>>();
  for (const result of shown) {
    if (result.gameId && result.legendCardId) {
      legendIdsByGame.set(result.gameId, (legendIdsByGame.get(result.gameId) ?? new Set()).add(result.legendCardId));
    }
  }
  const [legendCards, decks] = await Promise.all([
    Promise.all([...legendIdsByGame].map(([gameId, ids]) => getDeckCardInfos(gameId, [...ids]))),
    getDeckSummariesByIds(shown.flatMap((result) => (result.deckId ? [result.deckId] : []))),
  ]);
  const legendImage = new Map(legendCards.flat().map((card) => [card.id, card.image]));
  const inGroup = new Set(groupDecks.map((link) => link.deckId));
  const deckLink = new Map<string, DeckLink>();
  for (const deck of decks) {
    deckLink.set(deck.id, {
      name: deck.name,
      href: inGroup.has(deck.id)
        ? viewHref(playGroupId, "decks", { filters: { deck: deck.id } })
        : deck.visibility !== "private" || deck.playerId === viewer.userId
          ? `/decks/${deck.id}`
          : undefined,
    });
  }

  const members_ = members
    .filter((member) => results.some((result) => result.userId === member.userId))
    .map((member) => ({ value: member.userId, label: nameOf(member.userId) }));
  const legends = groupLegends(inGame).map((legend) => ({ value: legend.name, label: legend.name }));
  const filtered = Object.values(params).some(Boolean);
  const since = timeline.since
    ? DateTime.fromISO(`${timeline.since}-01`).setLocale(locale).toFormat("LLLL yyyy")
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? t("summaryEmpty")
              : t("summary", { participations: timeline.participations, tournaments: timeline.tournaments, since: since ?? "" })}
          </p>
        </div>
        <DeclareResultDialog
          gameNames={Object.fromEntries(gameName)}
          defaultGameId={filters.gameId ?? [...gameCounts.keys()][0] ?? games[0]?.id}
        />
      </header>

      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip href={hrefWith({ jeu: undefined, legende: undefined })} active={!filters.gameId}>
              {t("allGames")}
              <span className="font-mono text-[11px] text-muted-foreground">{results.length}</span>
            </FilterChip>
            {[...gameCounts].map(([gameId, count]) => (
              <FilterChip key={gameId} href={hrefWith({ jeu: gameId, legende: undefined })} active={filters.gameId === gameId}>
                {gameName.get(gameId) ?? gameId}
                <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
              </FilterChip>
            ))}
          </div>
          <TournamentFilterBar playGroupId={playGroupId} params={params} members={members_} legends={legends} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {results.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
              <Trophy className="size-8 text-[var(--group-accent-text)]" aria-hidden />
              <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
              <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
            </section>
          ) : timeline.months.length === 0 ? (
            <section className="flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
              {filtered && (
                <Link
                  href={viewHref(playGroupId, "tournaments")}
                  className="text-sm font-medium text-[var(--group-accent-text)] hover:underline"
                >
                  {t("resetFilters")}
                </Link>
              )}
            </section>
          ) : (
            timeline.months.map((month) => (
              <section key={month.month} className="flex flex-col gap-3" aria-labelledby={`month-${month.month}`}>
                <h2
                  id={`month-${month.month}`}
                  className="font-mono text-[11px] font-semibold tracking-[.12em] text-muted-foreground uppercase"
                >
                  {DateTime.fromISO(`${month.month}-01`).setLocale(locale).toFormat("LLLL yyyy")}
                </h2>
                {month.tournaments.map((tournament) => (
                  <TournamentArticle
                    key={tournament.key}
                    tournament={tournament}
                    locale={locale}
                    viewerId={viewer.userId}
                    gameName={filters.gameId ? undefined : tournament.gameId ? gameName.get(tournament.gameId) : undefined}
                    memberById={memberById}
                    nameOf={nameOf}
                    legendImage={legendImage}
                    deckLink={deckLink}
                    t={t}
                  />
                ))}
              </section>
            ))
          )}

          {timeline.nextBefore && (
            <Link
              href={viewHref(playGroupId, "tournaments", { filters: { ...params, avant: timeline.nextBefore } })}
              scroll={false}
              className="inline-flex h-10 items-center justify-center gap-2 self-center rounded-full border px-5 text-sm font-medium hover:bg-accent"
            >
              <ChevronDown className="size-4" aria-hidden />
              {t("older", {
                month: DateTime.fromISO(`${timeline.nextBefore}-01`).setLocale(locale).toFormat("LLLL yyyy"),
              })}
            </Link>
          )}
        </div>

        <aside className="flex flex-col gap-4 self-start">
          {palmares.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-[var(--group-accent-text)]" aria-hidden />
                {t("palmares")}
              </h2>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">
                    <th className="pb-1.5 font-medium">
                      <span className="sr-only">{t("memberFilter")}</span>
                    </th>
                    <th className="pb-1.5 text-right font-medium" title={t("palmaresWinsHint")}>
                      {t("palmaresWins")}
                    </th>
                    <th className="pb-1.5 text-right font-medium">{t("palmaresTopEights")}</th>
                    <th className="pb-1.5 text-right font-medium">{t("palmaresTournaments")}</th>
                  </tr>
                </thead>
                <tbody>
                  {palmares.map((row) => (
                    <tr key={row.userId} className="border-t">
                      <td className="py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <MemberDot name={nameOf(row.userId)} avatar={memberById.get(row.userId)?.avatar} />
                          <span className="truncate">{nameOf(row.userId)}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold">{row.wins}</td>
                      <td className="py-1.5 text-right font-mono">{row.topEights}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{row.tournaments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 text-[var(--group-accent-text)]" aria-hidden />
              {t("upcoming")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("upcomingEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcoming.map((tournament) => {
                  const date = DateTime.fromISO(tournament.date).setLocale(locale);
                  return (
                    <li key={tournament.tournamentId} className="flex gap-3">
                      <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border py-1 leading-none">
                        <span className="text-[15px] font-bold">{date.toFormat("d")}</span>
                        <span className="font-mono text-[9px] tracking-[.08em] text-muted-foreground uppercase">
                          {date.toFormat("LLL")}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link href={`/tournaments/${tournament.tournamentId}`} className="truncate text-[13px] font-medium hover:underline">
                          {tournament.name}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {t("upcomingMembers", {
                            count: tournament.userIds.length,
                            names: tournament.userIds.map(nameOf).join(", "),
                          })}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-xl border bg-card/60 p-4 text-[13px] text-muted-foreground">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="size-4 text-[var(--group-accent-text)]" aria-hidden />
              {t("sourcesTitle")}
            </h2>
            <p>{t("sourcesJoutes")}</p>
            <p>{t("sourcesLocator")}</p>
            <p>{t("sourcesDeclared")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations<"PlayGroups.hub.tournaments">>>;

function TournamentArticle({
  tournament,
  locale,
  viewerId,
  gameName,
  memberById,
  nameOf,
  legendImage,
  deckLink,
  t,
}: {
  tournament: TimelineTournament<TournamentResult>;
  locale: string;
  viewerId: string | null;
  gameName?: string;
  memberById: Map<string, PlayGroupMemberProfile>;
  nameOf: (userId: string) => string;
  legendImage: Map<string, string | undefined>;
  deckLink: Map<string, DeckLink>;
  t: Translate;
}) {
  const date = DateTime.fromISO(tournament.date).setLocale(locale);
  const ranked = tournament.results.filter((result) => result.placement !== undefined || result.userId === viewerId);
  const unranked = tournament.results.filter((result) => result.placement === undefined && result.userId !== viewerId);
  const joutesId = tournament.key.startsWith("joutes:") ? tournament.key.slice("joutes:".length) : undefined;
  const source =
    tournament.source === "joutes"
      ? t("sourceJoutes")
      : tournament.source === "locator"
        ? t("sourceLocator")
        : t("sourceDeclared", { member: nameOf(tournament.results[0].userId) });

  return (
    <div className="flex gap-3">
      <span className="flex w-11 shrink-0 flex-col items-center pt-3 leading-none">
        <span className="text-lg font-bold">{date.toFormat("d")}</span>
        <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">{date.toFormat("ccc")}</span>
      </span>
      <article className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
        <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {gameName && (
                <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">
                  {gameName}
                </span>
              )}
              {joutesId ? (
                <Link href={`/tournaments/${joutesId}`} className="min-w-0 font-semibold break-words hover:underline">
                  {tournament.name}
                </Link>
              ) : (
                <h3 className="min-w-0 font-semibold break-words">{tournament.name}</h3>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                source,
                tournament.place,
                tournament.playerCount ? t("players", { count: tournament.playerCount }) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        <ul className="flex flex-col divide-y">
          {ranked.map((result) => (
            <ResultRow
              key={result.id}
              result={result}
              mine={result.userId === viewerId}
              name={nameOf(result.userId)}
              avatar={memberById.get(result.userId)?.avatar}
              legendImage={result.legendCardId ? legendImage.get(result.legendCardId) : undefined}
              deck={result.deckId ? deckLink.get(result.deckId) : undefined}
              t={t}
            />
          ))}
        </ul>
        {unranked.length > 0 && (
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {t("unranked", { count: unranked.length, names: unranked.map((result) => nameOf(result.userId)).join(", ") })}
          </p>
        )}
      </article>
    </div>
  );
}

function ResultRow({
  result,
  mine,
  name,
  avatar,
  legendImage,
  deck,
  t,
}: {
  result: TournamentResult;
  mine: boolean;
  name: string;
  avatar?: string;
  legendImage?: string;
  deck?: DeckLink;
  t: Translate;
}) {
  const record = formatRecord(result.record);
  const top = result.placement !== undefined && result.placement <= 8;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      <span
        className={cn(
          "w-11 shrink-0 font-mono text-[15px] font-bold",
          result.placement === 1 ? "text-[var(--group-accent-text)]" : top ? "" : "text-muted-foreground",
        )}
      >
        {result.placement !== undefined ? t("placement", { place: result.placement }) : "—"}
      </span>
      <span className="flex min-w-[140px] flex-1 items-center gap-2">
        <MemberDot name={name} avatar={avatar} />
        <span className="truncate text-sm font-medium">{name}</span>
        {result.topCut && (
          <span className="shrink-0 rounded-full bg-[var(--group-accent-14)] px-1.5 py-px font-mono text-[10px] text-[var(--group-accent-text)]">
            {t("topCut", { size: result.topCut })}
          </span>
        )}
      </span>
      <span className="flex min-w-[120px] flex-1 items-center gap-2 text-[13px]">
        {result.legendName ? (
          <>
            <LegendThumb image={legendImage} />
            <span className="truncate">{result.legendName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="flex min-w-[120px] flex-1 items-center gap-1.5 text-[13px]">
        {!result.deckId ? (
          <span className="text-muted-foreground italic">{t("noDeck")}</span>
        ) : deck?.href ? (
          <Link href={deck.href} className="truncate hover:underline">
            {deck.name}
            {result.deckVersion ? <span className="ml-1 font-mono text-xs text-muted-foreground">v{result.deckVersion}</span> : null}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground italic">
            <Lock className="size-3" aria-hidden />
            {t("deckNotShared")}
          </span>
        )}
      </span>
      <span className="ml-auto w-14 shrink-0 text-right font-mono text-[13px] text-muted-foreground">{record ?? ""}</span>
      {/* La place du menu est gardée sur toutes les lignes : les colonnes restent alignées. */}
      <span className="flex w-8 shrink-0 justify-end">
        {mine && (
          <MyResultMenu
            resultId={result.id}
            gameId={result.gameId}
            source={result.source}
            visibility={result.visibility}
            deckId={result.deckId}
          />
        )}
      </span>
    </li>
  );
}

function LegendThumb({ image }: { image?: string }) {
  if (!image) {
    return <span aria-hidden className="h-7 w-5 shrink-0 rounded-[3px] border bg-muted" />;
  }

  return (
    <span className="h-7 w-5 shrink-0 overflow-hidden rounded-[3px] border">
      {/* Les images de cartes viennent de plusieurs hôtes : `next/image` les refuserait. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="size-full object-cover object-top" loading="lazy" />
    </span>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-[13px] text-[13px] transition-colors",
        active ? "border-[var(--group-accent)] bg-[var(--group-accent-14)] text-[var(--group-accent-text)]" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

function MemberDot({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <span className="size-6 shrink-0 overflow-hidden rounded-full">
        {/* `next/image` refuserait l'hôte : les avatars viennent de fournisseurs externes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--group-accent-16)] text-[10px] font-bold text-[var(--group-accent-text)]"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
