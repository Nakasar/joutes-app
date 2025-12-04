"use client";

import { useState, useEffect, useCallback } from "react";
import { League, LeagueFormat, LeagueStatus, PaginatedLeaguesResult } from "@/lib/types/League";
import { Game } from "@/lib/types/Game";
import { searchLeaguesAction } from "./actions";
import LeaguesFilters, { LeaguesFiltersValues } from "./LeaguesFilters";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  ArrowRight,
  Users,
  Target,
  Award,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
} from "lucide-react";

type LeaguesClientProps = {
  initialData: PaginatedLeaguesResult;
  games: Game[];
};

const STATUS_LABELS: Record<LeagueStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Inscriptions ouvertes",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

const STATUS_COLORS: Record<LeagueStatus, string> = {
  DRAFT: "bg-gray-500",
  OPEN: "bg-green-500",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED: "bg-purple-500",
  CANCELLED: "bg-red-500",
};

const FORMAT_LABELS: Record<LeagueFormat, string> = {
  KILLER: "Killer",
  POINTS: "Points",
};

export default function LeaguesClient({ initialData, games }: LeaguesClientProps) {
  const [data, setData] = useState<PaginatedLeaguesResult>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<LeaguesFiltersValues>({
    search: "",
    format: "all",
    status: "all",
    gameId: "all",
  });

  const fetchLeagues = useCallback(
    async (currentFilters: LeaguesFiltersValues, page: number = 1) => {
      setIsLoading(true);
      try {
        const result = await searchLeaguesAction({
          search: currentFilters.search || undefined,
          format: currentFilters.format !== "all" ? currentFilters.format : undefined,
          status: currentFilters.status !== "all" ? currentFilters.status : undefined,
          gameIds: currentFilters.gameId !== "all" ? [currentFilters.gameId] : undefined,
          page,
          limit: 10,
        });
        setData(result);
      } catch (error) {
        console.error("Error fetching leagues:", error);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Fetch when filters change
  useEffect(() => {
    fetchLeagues(filters, 1);
  }, [filters, fetchLeagues]);

  const handleFiltersChange = (newFilters: LeaguesFiltersValues) => {
    setFilters(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    fetchLeagues(filters, newPage);
  };

  return (
    <div className="space-y-6">
      <LeaguesFilters
        games={games}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        isLoading={isLoading}
      />

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} ligue{data.total > 1 ? "s" : ""} trouvée{data.total > 1 ? "s" : ""}
        </span>
        {isLoading && (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </span>
        )}
      </div>

      {/* Leagues grid */}
      {data.leagues.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">
              Aucune ligue ne correspond à vos critères.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.leagues.map((league) => (
            <LeagueCard key={league.id} league={league} games={games} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(data.page - 1)}
            disabled={data.page <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>

          <div className="flex items-center gap-1">
            {generatePaginationNumbers(data.page, data.totalPages).map((pageNum, index) =>
              pageNum === "..." ? (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={pageNum}
                  variant={pageNum === data.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum as number)}
                  disabled={isLoading}
                  className="min-w-[40px]"
                >
                  {pageNum}
                </Button>
              )
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(data.page + 1)}
            disabled={data.page >= data.totalPages || isLoading}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function LeagueCard({ league, games }: { league: League; games: Game[] }) {
  const leagueGames = games.filter((g) => league.gameIds.includes(g.id));

  return (
    <Link href={`/leagues/${league.id}`} className="group">
      <Card className="h-full overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        {league.banner ? (
          <div className="relative w-full h-48 overflow-hidden">
            <img
              src={league.banner}
              alt={league.name}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute top-2 right-2">
              <Badge className={`${STATUS_COLORS[league.status]} text-white`}>
                {STATUS_LABELS[league.status]}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-48 bg-gradient-to-br from-primary/80 to-purple-600/80 flex items-center justify-center">
            <Trophy className="h-16 w-16 text-white" />
            <div className="absolute top-2 right-2">
              <Badge className={`${STATUS_COLORS[league.status]} text-white`}>
                {STATUS_LABELS[league.status]}
              </Badge>
            </div>
          </div>
        )}

        <CardHeader>
          <CardTitle className="text-2xl group-hover:text-primary transition-colors line-clamp-2">
            {league.name}
          </CardTitle>
          {league.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {league.description}
            </p>
          )}
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {/* Format */}
            <div className="flex items-center gap-2">
              {league.format === "KILLER" ? (
                <Target className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Award className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant="outline">{FORMAT_LABELS[league.format]}</Badge>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {league.participants.length} participant
                {league.participants.length > 1 ? "s" : ""}
                {league.maxParticipants && ` / ${league.maxParticipants} max`}
              </span>
            </div>

            {/* Games */}
            {leagueGames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {leagueGames.slice(0, 3).map((game) => (
                  <Badge key={game.id} variant="secondary" className="text-xs">
                    {game.name}
                  </Badge>
                ))}
                {leagueGames.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{leagueGames.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Dates */}
            {league.startDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(league.startDate).toLocaleDateString("fr-FR")}
                  {league.endDate &&
                    ` - ${new Date(league.endDate).toLocaleDateString("fr-FR")}`}
                </span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button
            variant="ghost"
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
          >
            Voir la ligue
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

function generatePaginationNumbers(
  currentPage: number,
  totalPages: number
): (number | "...")[] {
  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    pages.push(totalPages);
  }

  return pages;
}
