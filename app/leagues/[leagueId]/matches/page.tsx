import { getLeagueById, getLeagueParticipant, isLeagueOrganizer } from "@/lib/db/leagues";
import { getMatches } from "@/lib/db/matches";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import Link from "next/link";
import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Swords, Trophy } from "lucide-react";
import { LeagueTypeMatch } from "@/lib/types/Match";

const PAGE_SIZE = 20;

type LeagueMatchesPageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ page?: string }>;
};

type MatchPagePlayer = {
  userId: string;
  user?: {
    id: string;
    username: string;
    displayName?: string;
    discriminator?: string;
    avatar?: string;
  };
};

function formatPlayerName(player?: MatchPagePlayer) {
  if (!player?.user) {
    return player?.userId || "Joueur inconnu";
  }

  if (player.user.displayName) {
    return player.user.discriminator
      ? `${player.user.displayName}#${player.user.discriminator}`
      : player.user.displayName;
  }

  return player.user.username || player.user.id;
}

function toDateTime(value?: Date | string) {
  if (!value) {
    return DateTime.invalid("missing");
  }

  return value instanceof Date
    ? DateTime.fromJSDate(value)
    : DateTime.fromISO(value);
}

function getPaginationPages(currentPage: number, totalPages: number): Array<number | "..."> {
  const pages: Array<number | "..."> = [];

  if (totalPages <= 7) {
    for (let page = 1; page <= totalPages; page += 1) {
      pages.push(page);
    }
    return pages;
  }

  pages.push(1);

  if (currentPage > 3) {
    pages.push("...");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (currentPage < totalPages - 2) {
    pages.push("...");
  }

  pages.push(totalPages);
  return pages;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeagueById(leagueId);

  if (!league) {
    return {
      title: "Historique introuvable",
    };
  }

  return {
    title: `${league.name} - Matchs`,
    description: `Historique des matchs de la ligue ${league.name}`,
  };
}

export default async function LeagueMatchesPage({
  params,
  searchParams,
}: LeagueMatchesPageProps) {
  const [{ leagueId }, { page: pageParam }] = await Promise.all([params, searchParams]);

  const requestedPage = Number.parseInt(pageParam || "1", 10);
  const parsedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const league = await getLeagueById(leagueId);
  if (!league) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const leagueParticipant = session?.user?.id
    ? await getLeagueParticipant(league.id, session.user.id)
    : null;

  const canManage = session?.user?.id
    ? await isLeagueOrganizer(leagueId, session.user.id)
    : false;

  const isParticipant = !!leagueParticipant;

  if (!league.isPublic && !isParticipant && !canManage) {
    notFound();
  }

  const gameById = new Map(league.games.map((game) => [game.id, game]));
  const lairById = new Map(league.lairs.map((lair) => [lair.id, lair]));

  const totalMatches = (league.matches || []).length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));
  const currentPage = Math.min(parsedPage, totalPages);

  const pageMatchesRaw = await getMatches({
    matchType: "league",
    leagueId: league.id,
    page: currentPage,
    limit: PAGE_SIZE,
  });

  const pageMatches = pageMatchesRaw.filter(
    (match): match is LeagueTypeMatch => match.matchType === "league"
  );

  const playerById = new Map<string, MatchPagePlayer>(
    pageMatches
      .flatMap((match) =>
        (match.players || []).map((player) => [
          player.userId,
          {
            userId: player.userId,
            user: {
              id: player.userId,
              username: player.username,
              displayName: player.displayName,
              discriminator: player.discriminator,
            },
          },
        ] as const)
      )
  );

  const buildPageHref = (page: number) => `/leagues/${league.id}/matches?page=${page}`;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/leagues/${league.id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Swords className="h-7 w-7" />
                Historique des matchs
              </h1>
              <p className="text-muted-foreground">
                {totalMatches} match{totalMatches > 1 ? "s" : ""} dans la ligue {league.name}
              </p>
            </div>
          </div>

          <Button variant="outline" asChild>
            <Link href={`/leagues/${league.id}`}>
              Retour a la ligue
            </Link>
          </Button>
        </div>

        {pageMatches.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucun match n&apos;a encore ete enregistre dans cette ligue.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pageMatches.map((match) => {
              const playedAt = toDateTime(match.playedAt).setLocale("fr");
              const winners = new Set(match.winnerIds || []);
              const playersAwaitingConfirmation = match.playerIds.filter(
                (playerId) => !(match.confirmedPlayerIds || []).includes(playerId)
              );
              const game = gameById.get(match.gameId);
              const lairName =
                (match.lairId ? lairById.get(match.lairId)?.name : undefined) ||
                match.lairName ||
                "Lieu non renseigne";

              return (
                <Card key={match.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg">
                        {game?.name || "Jeu inconnu"}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={match.status === "CONFIRMED" ? "default" : "secondary"}>
                          {match.status === "CONFIRMED"
                            ? "Confirme"
                            : match.status === "REPORTED"
                            ? "Rapporte"
                            : "En attente"}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription>
                      {playedAt.isValid
                        ? playedAt.toFormat("dd LLL yyyy a HH:mm")
                        : "Date inconnue"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Joueurs</p>
                      <div className="flex flex-wrap gap-2">
                        {match.playerIds.map((playerId) => {
                          const player = playerById.get(playerId);
                          const playerName = formatPlayerName(player);
                          const isWinner = winners.has(playerId);

                          return (
                            <Badge key={`${match.id}-${playerId}`} variant={isWinner ? "default" : "outline"}>
                              {isWinner && <Trophy className="h-3 w-3 mr-1" />}
                              {playerName}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {playersAwaitingConfirmation.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        En attente de confirmation joueur :{" "}
                        {playersAwaitingConfirmation
                          .map((playerId) => formatPlayerName(playerById.get(playerId)))
                          .join(", ")}
                      </p>
                    )}

                    {league.lairIds.length > 0 && match.lairId && !match.lairConfirmedBy && (
                      <p className="text-xs text-muted-foreground">
                        En attente de validation du lieu
                      </p>
                    )}

                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {lairName}
                    </p>

                    {match.notes && (
                      <p className="text-sm text-muted-foreground border-t pt-2">
                        {match.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {currentPage > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildPageHref(currentPage - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Precedent
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Precedent
              </Button>
            )}

            <div className="flex items-center gap-1">
              {getPaginationPages(currentPage, totalPages).map((page, index) =>
                page === "..." ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                    ...
                  </span>
                ) : page === currentPage ? (
                  <Button key={page} size="sm" className="min-w-[40px]" disabled>
                    {page}
                  </Button>
                ) : (
                  <Button key={page} variant="outline" size="sm" className="min-w-[40px]" asChild>
                    <Link href={buildPageHref(page)}>{page}</Link>
                  </Button>
                )
              )}
            </div>

            {currentPage < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildPageHref(currentPage + 1)}>
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Suivant
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
