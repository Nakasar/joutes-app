import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { CalendarClock, ChevronDown, Info, Lock, Medal as MedalIcon, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { getDeckSummariesByIds } from "@/lib/db/decks.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { listPlayGroupDecks } from "@/lib/db/play-group-decks.ts";
import {
  filterGroupResults,
  groupLegends,
  groupPalmares,
  groupTournamentFilterParams,
  readGroupTournamentFilters,
} from "@/lib/play-groups/tournaments.ts";
import { listUpcomingRegistrations, readGroupTournaments } from "@/lib/tournaments/result-service.ts";
import {
  formatRecord,
  medalFor,
  summarizeResults,
  type Medal,
  type TimelineTournament,
} from "@/lib/tournaments/results.ts";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import { cn } from "@/lib/utils.ts";

import { readGroupMembers, requirePlayGroupMember, type PlayGroupMemberProfile } from "../group-data.ts";
import { FilterChip, GameIcon, LegendThumb, MemberDot, type GameInfo } from "../game-ui.tsx";
import { viewHref } from "../views.ts";
import { DeclareResultDialog } from "./DeclareResultDialog.tsx";
import { MyResultMenu } from "./MyResultMenu.tsx";
import { TournamentFilterBar } from "./TournamentFilterBar.tsx";

export type TournamentSearchParams = Record<string, string | string[] | undefined>;

type DeckLink = { name: string; href: string };

/**
 * Les couleurs du podium. Une pastille pleine porte un texte sombre : elle se
 * lit pareil en thème clair et en thème sombre. `soft` teinte le fond d'une
 * ligne ou d'une carte, `ring` en dessine le bord.
 */
const MEDALS: Record<Medal, { solid: string; soft: string; ring: string; ink: string }> = {
  gold: { solid: "#f2c94c", soft: "rgba(242, 201, 76, 0.12)", ring: "rgba(242, 201, 76, 0.55)", ink: "#2b2000" },
  silver: { solid: "#c5ced9", soft: "rgba(197, 206, 217, 0.10)", ring: "rgba(197, 206, 217, 0.5)", ink: "#1b232c" },
  bronze: { solid: "#d68c52", soft: "rgba(214, 140, 82, 0.12)", ring: "rgba(214, 140, 82, 0.55)", ink: "#2a1405" },
};

/**
 * Les tournois des membres (`?view=tournaments`) : leurs résultats, réunis par
 * tournoi puis par mois, sur une frise. Les podiums ressortent en or, argent
 * et bronze. Un membre apporte tout son historique ; un ancien membre
 * n'apporte plus rien. Tout membre voit tout : un résultat « groupes » est
 * fait pour les groupes que l'on partage, et c'en est un.
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
  const filters = readGroupTournamentFilters(searchParams);
  const [{ summaries: results, timeline }, upcoming, groupDecks] = await Promise.all([
    readGroupTournaments(memberIds, filters),
    listUpcomingRegistrations(memberIds),
    listPlayGroupDecks(playGroupId),
  ]);

  const params = groupTournamentFilterParams(filters);
  const hrefWith = (patch: Record<string, string | undefined>) =>
    viewHref(playGroupId, "tournaments", { filters: { ...params, avant: undefined, ...patch } });

  const gameById = new Map<string, GameInfo>(games.map((game) => [game.id, { name: game.name, icon: game.icon }]));
  const gameCounts = new Map<string, number>();
  for (const result of results) {
    if (result.gameId) gameCounts.set(result.gameId, (gameCounts.get(result.gameId) ?? 0) + 1);
  }
  const inGame = filters.gameId ? results.filter((result) => result.gameId === filters.gameId) : results;
  const totals = summarizeResults(filterGroupResults(results, filters));
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
    const href = inGroup.has(deck.id)
      ? viewHref(playGroupId, "decks", { filters: { deck: deck.id } })
      : deck.visibility !== "private" || deck.playerId === viewer.userId
        ? `/decks/${deck.id}`
        : undefined;
    // Un deck privé hors du groupe : son nom ne quitte pas le serveur.
    if (href) deckLink.set(deck.id, { name: deck.name, href });
  }

  const memberOptions = members
    .filter((member) => results.some((result) => result.userId === member.userId))
    .map((member) => ({ value: member.userId, label: nameOf(member.userId) }));
  const legends = groupLegends(inGame).map((legend) => ({ value: legend.name, label: legend.name }));
  const filtered = Object.values(params).some(Boolean);
  const monthLabel = (month: string) => DateTime.fromISO(`${month}-01`).setLocale(locale).toFormat("LLLL yyyy");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? t("summaryEmpty")
              : t("summary", {
                  participations: timeline.participations,
                  tournaments: timeline.tournaments,
                  since: timeline.since ? monthLabel(timeline.since) : "",
                })}
          </p>
        </div>
        <DeclareResultDialog
          gameNames={Object.fromEntries([...gameById].map(([id, game]) => [id, game.name]))}
          defaultGameId={filters.gameId ?? [...gameCounts.keys()][0] ?? games[0]?.id}
        />
      </header>

      {results.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t("statWins")} value={totals.wins} medal="gold" />
            <StatTile label={t("statPodiums")} value={totals.podiums} medal="silver" />
            <StatTile label={t("statTopEights")} value={totals.topEights} />
            <StatTile label={t("statTournaments")} value={timeline.tournaments} />
          </dl>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <FilterChip href={hrefWith({ jeu: undefined, legende: undefined })} active={!filters.gameId}>
                {t("allGames")}
                <span className="font-mono text-[11px] text-muted-foreground">{results.length}</span>
              </FilterChip>
              {[...gameCounts].map(([gameId, count]) => (
                <FilterChip key={gameId} href={hrefWith({ jeu: gameId, legende: undefined })} active={filters.gameId === gameId}>
                  <GameIcon game={gameById.get(gameId)} size="sm" />
                  {gameById.get(gameId)?.name ?? gameId}
                  <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
                </FilterChip>
              ))}
            </div>
            <TournamentFilterBar playGroupId={playGroupId} params={params} members={memberOptions} legends={legends} />
          </div>
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-2">
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
            // La frise : un fil vertical, un mois après l'autre, un point par tournoi.
            <ol className="relative flex flex-col gap-7 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border sm:before:left-[9px]">
              {timeline.months.map((month) => {
                const monthResults = month.tournaments.flatMap((tournament) => tournament.results);
                const podiums = monthResults.filter((result) => medalFor(result.placement)).length;

                return (
                  <li key={month.month} className="flex flex-col gap-3" aria-labelledby={`month-${month.month}`}>
                    <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-7 sm:pl-9">
                      <span
                        aria-hidden
                        className="absolute top-1.5 left-0 size-[15px] rounded-full border-2 border-[var(--group-accent)] bg-background sm:size-[19px]"
                      />
                      <h2 id={`month-${month.month}`} className="text-lg font-bold capitalize">
                        {monthLabel(month.month)}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {t("monthSummary", { tournaments: month.tournaments.length, podiums })}
                      </span>
                    </div>
                    <ol className="flex flex-col gap-3">
                      {month.tournaments.map((tournament) => (
                        <TournamentCard
                          key={tournament.key}
                          tournament={tournament}
                          locale={locale}
                          viewerId={viewer.userId}
                          game={tournament.gameId ? gameById.get(tournament.gameId) : undefined}
                          memberById={memberById}
                          nameOf={nameOf}
                          legendImage={legendImage}
                          deckLink={deckLink}
                          t={t}
                        />
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ol>
          )}

          {timeline.nextBefore && (
            <Link
              href={viewHref(playGroupId, "tournaments", { filters: { ...params, avant: timeline.nextBefore } })}
              scroll={false}
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 self-center rounded-full border px-5 text-sm font-medium hover:bg-accent"
            >
              <ChevronDown className="size-4" aria-hidden />
              {t("older", { month: monthLabel(timeline.nextBefore) })}
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
              <ol className="flex flex-col gap-1">
                {palmares.map((row, index) => {
                  const medal = medalFor(index + 1);
                  return (
                    <li
                      key={row.userId}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                      style={medal && row.wins + row.podiums > 0 ? { background: MEDALS[medal].soft } : undefined}
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">{index + 1}</span>
                      <MemberDot name={nameOf(row.userId)} avatar={memberById.get(row.userId)?.avatar} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{nameOf(row.userId)}</span>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-xs">
                        <span className="inline-flex items-center gap-1" title={t("palmaresWinsHint")}>
                          <MedalDot medal="gold" />
                          {row.wins}
                        </span>
                        <span className="inline-flex items-center gap-1" title={t("statPodiums")}>
                          <MedalDot medal="silver" />
                          {row.podiums}
                        </span>
                        <span className="text-muted-foreground" title={t("palmaresTournaments")}>
                          / {row.tournaments}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-[11px] text-muted-foreground">{t("palmaresLegend")}</p>
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
                        <span className="flex min-w-0 items-center gap-1.5">
                          {tournament.gameId && <GameIcon game={gameById.get(tournament.gameId)} size="sm" />}
                          {viewer.userId && tournament.userIds.includes(viewer.userId) ? (
                            <Link
                              href={`/tournaments/${tournament.tournamentId}/player`}
                              className="truncate text-[13px] font-medium hover:underline"
                            >
                              {tournament.name}
                            </Link>
                          ) : (
                            <span className="truncate text-[13px] font-medium">{tournament.name}</span>
                          )}
                        </span>
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

function TournamentCard({
  tournament,
  locale,
  viewerId,
  game,
  memberById,
  nameOf,
  legendImage,
  deckLink,
  t,
}: {
  tournament: TimelineTournament<TournamentResult>;
  locale: string;
  viewerId: string | null;
  game?: GameInfo;
  memberById: Map<string, PlayGroupMemberProfile>;
  nameOf: (userId: string) => string;
  legendImage: Map<string, string | undefined>;
  deckLink: Map<string, DeckLink>;
  t: Translate;
}) {
  const date = DateTime.fromISO(tournament.date).setLocale(locale);
  const ranked = tournament.results.filter((result) => result.placement !== undefined || result.userId === viewerId);
  const unranked = tournament.results.filter((result) => result.placement === undefined && result.userId !== viewerId);
  const best = ranked.find((result) => result.placement !== undefined);
  const medal = medalFor(best?.placement);
  const topEight = !medal && best?.placement !== undefined && best.placement <= 8;
  // La page d'un tournoi Joutes ne s'ouvre qu'à ses joueurs (et son staff) : le lien
  // n'apparaît que si j'y ai un résultat, donc que j'y étais inscrit.
  const joutesId =
    tournament.key.startsWith("joutes:") && tournament.results.some((result) => result.userId === viewerId)
      ? tournament.key.slice("joutes:".length)
      : undefined;
  const source =
    tournament.source === "joutes"
      ? t("sourceJoutes")
      : tournament.source === "locator"
        ? t("sourceLocator")
        : t("sourceDeclared", { member: nameOf(tournament.results[0].userId) });

  return (
    <li className="relative pl-7 sm:pl-9">
      {/* Le point de la frise prend la couleur du meilleur résultat du tournoi. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-6 left-[3px] size-[9px] rounded-full sm:left-[5px]",
          !medal && (topEight ? "bg-[var(--group-accent)]" : "bg-muted-foreground/50"),
        )}
        style={medal ? { background: MEDALS[medal].solid, boxShadow: `0 0 0 4px ${MEDALS[medal].soft}` } : undefined}
      />
      <article
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card"
        style={
          medal
            ? {
                borderColor: MEDALS[medal].ring,
                backgroundImage: `linear-gradient(135deg, ${MEDALS[medal].soft}, transparent 55%)`,
              }
            : undefined
        }
      >
        <header className="flex flex-wrap items-start gap-3 px-4 pt-3.5 pb-3">
          <GameIcon game={game} size="lg" />
          {/* Sur téléphone, le titre prend toute la ligne : la pastille du meilleur résultat passe dessous. */}
          <div className="flex min-w-0 flex-1 basis-[calc(100%-52px)] flex-col gap-0.5 sm:basis-0">
            {joutesId ? (
              <Link href={`/tournaments/${joutesId}/player`} className="font-semibold break-words hover:underline">
                {tournament.name}
              </Link>
            ) : (
              <h3 className="font-semibold break-words">{tournament.name}</h3>
            )}
            <p className="text-xs text-muted-foreground">
              {[
                date.toFormat("ccc d LLL"),
                source,
                tournament.place,
                tournament.playerCount ? t("players", { count: tournament.playerCount }) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {best && (medal || topEight) && (
            <span
              className={cn(
                // Sur téléphone, sous le titre : à droite, il l'écraserait.
                "order-3 ml-[52px] inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:order-none sm:ml-0",
                topEight && "bg-[var(--group-accent-14)] text-[var(--group-accent-text)]",
              )}
              style={medal ? { background: MEDALS[medal].solid, color: MEDALS[medal].ink } : undefined}
            >
              {medal ? <Trophy className="size-3.5" aria-hidden /> : <MedalIcon className="size-3.5" aria-hidden />}
              {medal
                ? t(`highlight.${medal}`, { member: nameOf(best.userId) })
                : t("highlightTop", { member: nameOf(best.userId) })}
            </span>
          )}
        </header>

        <ul className="flex flex-col border-t">
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
    </li>
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
  const medal = medalFor(result.placement);

  return (
    <li
      className="flex items-center gap-x-3 border-t px-3 py-2.5 first:border-t-0 sm:px-4"
      style={medal ? { background: MEDALS[medal].soft } : undefined}
    >
      <PlacementBadge placement={result.placement} label={result.placement ? t("placement", { place: result.placement }) : "—"} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:min-w-[140px]">
        <span className="flex min-w-0 items-center gap-2">
          <MemberDot name={name} avatar={avatar} />
          <span className="truncate text-sm font-medium">{name}</span>
          {result.topCut && (
            <span className="shrink-0 rounded-full border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {t("topCut", { size: result.topCut })}
            </span>
          )}
        </span>
        {/* Sur téléphone, la légende et le deck passent sous le nom plutôt qu'en colonnes. */}
        {(result.legendName || result.deckId) && (
          <span className="truncate pl-8 text-xs text-muted-foreground sm:hidden">
            {[result.legendName, result.deckId ? (deck?.name ?? t("deckNotShared")) : undefined]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </span>
      <span className="hidden min-w-[120px] flex-1 items-center gap-2 text-[13px] sm:flex">
        {result.legendName ? (
          <>
            <LegendThumb image={legendImage} />
            <span className="truncate">{result.legendName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="hidden min-w-[120px] flex-1 items-center gap-1.5 text-[13px] sm:flex">
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
      <span className="ml-auto w-12 shrink-0 text-right font-mono text-[13px] text-muted-foreground">{record ?? ""}</span>
      {/* La place du menu est gardée sur toutes les lignes : les colonnes restent alignées. */}
      <span className="-mr-1 flex w-8 shrink-0 justify-end">
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

/** La place : une médaille pleine sur le podium, un anneau dans le top 8, un chiffre au-delà. */
function PlacementBadge({ placement, label }: { placement?: number; label: string }) {
  const medal = medalFor(placement);
  if (medal) {
    return (
      <span
        className="flex h-8 min-w-11 shrink-0 items-center justify-center rounded-full px-2 font-mono text-[13px] font-bold shadow-sm"
        style={{ background: MEDALS[medal].solid, color: MEDALS[medal].ink }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex h-8 min-w-11 shrink-0 items-center justify-center rounded-full px-2 font-mono text-[13px] font-semibold",
        placement !== undefined && placement <= 8
          ? "border border-[var(--group-accent-28)] text-[var(--group-accent-text)]"
          : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function MedalDot({ medal }: { medal: Medal }) {
  return <span aria-hidden className="size-2.5 rounded-full" style={{ background: MEDALS[medal].solid }} />;
}

function StatTile({ label, value, medal }: { label: string; value: number; medal?: Medal }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl border bg-card/60 px-4 py-3"
      style={medal && value > 0 ? { borderColor: MEDALS[medal].ring, background: MEDALS[medal].soft } : undefined}
    >
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {medal && <MedalDot medal={medal} />}
        {label}
      </dt>
      <dd className="text-2xl font-bold tracking-tight">{value}</dd>
    </div>
  );
}

