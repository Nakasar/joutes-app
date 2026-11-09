import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { BackLink } from "@/components/navigation/BackLink.tsx";
import { GameToolGridSkeleton, GameToolHeaderSkeleton } from "@/components/games/GameToolSkeletons.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { loadMetaEventsMatches } from "@/lib/db/meta-events.ts";
import { loadMetaSample } from "@/lib/meta/load.ts";
import { domainColor } from "@/lib/meta/domains.ts";
import { facedLegends, playerRounds, shortLegendName } from "@/lib/meta/match-stats.ts";
import { findTournamentDecks, findTournamentMatches } from "@/lib/meta/tournaments.ts";
import { cn } from "@/lib/utils.ts";
import { LegendThumb } from "../../../../../charts.tsx";
import { FacedLegendsList, MatchPanel } from "../../../../../matches.tsx";

type Params = Promise<{ gameSlugOrId: string; date: string; slug: string; playerId: string }>;

interface PlayerPageProps {
  params: Params;
}

/** Le joueur, son tournoi et son deck méta s'il a été importé ; une page introuvable sinon. */
async function loadPlayer(params: Params) {
  const { gameSlugOrId, date, slug, playerId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game?.features?.meta) notFound();
  const event = findTournamentMatches(await loadMetaEventsMatches(game.id), date, slug);
  const id = Number(playerId);
  const player = event?.players.find((candidate) => candidate.id === id);
  if (!event || !player) notFound();
  const sample = await loadMetaSample(game.id, game.slug);
  const deck = findTournamentDecks(sample.decks, date, slug).find((candidate) => candidate.pilot === player.name);
  const metaPath = `/games/${game.slug ?? game.id}/meta`;
  return { game, event, player, deck, date, tournamentHref: `${metaPath}/tournois/${date}/${slug}` };
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const t = await getTranslations("Games.meta");
  try {
    const { event, player, game } = await loadPlayer(params);
    return { title: t("matches.player.metadataTitle", { player: player.name, source: event.source, gameName: game.name }) };
  } catch {
    return { title: t("metadata.notFoundTitle") };
  }
}

/** Le parcours d'un joueur dans un tournoi importé avec ses matchs : ses rondes, ses adversaires et leurs légendes. */
export default function TournamentPlayerPage({ params }: PlayerPageProps) {
  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Suspense
        fallback={
          <>
            <GameToolHeaderSkeleton />
            <GameToolGridSkeleton cards={2} />
          </>
        }
      >
        <PlayerContent params={params} />
      </Suspense>
    </div>
  );
}

const RESULT_CLASS = {
  W: "bg-primary/15 text-primary",
  L: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  D: "bg-muted text-muted-foreground",
  BYE: "bg-muted text-muted-foreground",
} as const;

async function PlayerContent({ params }: PlayerPageProps) {
  const [{ event, player, deck, date, tournamentHref }, t, locale] = await Promise.all([
    loadPlayer(params),
    getTranslations("Games.meta"),
    getLocale(),
  ]);
  const rounds = playerRounds(event, player.id);
  const faced = facedLegends(event, [player.id]);
  const day = DateTime.fromISO(date, { zone: "utc" }).setLocale(locale).toLocaleString(DateTime.DATE_FULL);
  const place = player.place !== undefined ? t("matches.standings.place", { place: player.place }) : t("matches.player.noPlace");

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <BackLink href={`${tournamentHref}?vue=classement`} label={t("matches.player.back")}>
              ←{" "}
            </BackLink>
          </Button>
          <Link href={tournamentHref} className="text-sm text-muted-foreground hover:underline">
            {event.source} · {day}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <LegendThumb src={player.legendImage} className="h-24 w-[4.5rem] rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight break-words">{player.name}</h1>
            <p className="text-muted-foreground">
              {place} · {player.record}
              {player.legend && <> · {player.legend}</>}
            </p>
            {player.domains.length > 0 && (
              <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                {player.domains.map((domain) => (
                  <span key={domain} className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: domainColor(domain) }} aria-hidden />
                    {domain}
                  </span>
                ))}
              </span>
            )}
          </div>
          {deck && (
            <Button asChild>
              <Link href={`/decks/${deck.id}`}>{t("matches.player.seeDeck")}</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MatchPanel>
          <h2 className="text-base font-semibold">{t("matches.player.rounds")}</h2>
          <ol className="flex flex-col">
            {rounds.map((round) => (
              <li
                key={`${round.phase}-${round.round}`}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0"
              >
                <span className="text-muted-foreground tabular-nums">
                  {round.phase === "top" ? t("matches.player.topRound", { round: round.round }) : t("matches.player.roundShort", { round: round.round })}
                </span>
                {round.opponent ? (
                  <Link href={`${tournamentHref}/joueurs/${round.opponent.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                    <LegendThumb src={round.opponent.legendImage} className="h-9 w-7" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{round.opponent.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {round.opponent.legend ? shortLegendName(round.opponent.legend) : t("matches.player.unknownLegend")}
                        {round.opponent.place !== undefined && ` · ${t("matches.standings.place", { place: round.opponent.place })}`}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{round.result === "BYE" ? t("matches.player.bye") : "—"}</span>
                )}
                <span className="flex items-center gap-2">
                  {round.result !== "BYE" && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {round.games[0]}-{round.games[1]}
                    </span>
                  )}
                  <span className={cn("min-w-20 rounded-full px-2.5 py-0.5 text-center text-xs font-semibold", RESULT_CLASS[round.result])}>
                    {t(`matches.player.results.${round.result}`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </MatchPanel>

        {faced.length > 0 && (
          <MatchPanel className="self-start">
            <h2 className="text-base font-semibold">{t("matches.player.faced")}</h2>
            <FacedLegendsList t={t} rows={faced} />
          </MatchPanel>
        )}
      </div>
    </>
  );
}
