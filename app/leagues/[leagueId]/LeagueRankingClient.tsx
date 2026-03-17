"use client";

import { useCallback, useEffect, useState } from "react";
import { LeagueFormat } from "@/lib/types/League";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Medal,
} from "lucide-react";

const PAGE_SIZE = 16;

type RankingParticipant = {
  userId: string;
  rank: number;
  points: number;
  wins?: number;
  losses?: number;
  ratio?: number;
  feats: Array<{
    featId: string;
    earnedAt: string | Date;
    eventId?: string;
    matchId?: string;
  }>;
  user?: {
    id: string;
    username: string;
    displayName?: string;
    discriminator?: string;
    avatar?: string;
  };
};

type LeagueRankingResponse = {
  participants: RankingParticipant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type LeagueRankingClientProps = {
  leagueId: string;
  leagueFormat: LeagueFormat;
};

export default function LeagueRankingClient({
  leagueId,
  leagueFormat,
}: LeagueRankingClientProps) {
  const [data, setData] = useState<LeagueRankingResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRanking = useCallback(async (page: number = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });

      const response = await fetch(
        `/api/leagues/${leagueId}/ranking?${params.toString()}`,
        { cache: "no-store" }
      );
      const result = (await response.json()) as LeagueRankingResponse & {
        error?: string;
      };

      if (!response.ok) {
        setError(result.error || "Erreur lors du chargement du classement");
        return;
      }

      setData(result);
    } catch (fetchError) {
      console.error("Error fetching league ranking:", fetchError);
      setError("Erreur lors du chargement du classement");
    } finally {
      setIsLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    fetchRanking(1);
  }, [fetchRanking]);

  const handlePageChange = (newPage: number) => {
    if (!data) {
      return;
    }

    if (newPage < 1 || newPage > data.totalPages) {
      return;
    }

    fetchRanking(newPage);
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Chargement du classement...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-destructive">Impossible de charger le classement.</p>
        <Button variant="outline" size="sm" onClick={() => fetchRanking(1)}>
          Reessayer
        </Button>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Aucun participant pour le moment
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} participant{data.total > 1 ? "s" : ""}
        </span>
        {isLoading && (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </span>
        )}
      </div>

      <div className="space-y-2">
        {data.participants.map((participant) => (
          <div
            key={participant.userId}
            className={`flex items-center justify-between p-3 rounded-lg ${
              participant.rank === 1
                ? "bg-yellow-500/10 border border-yellow-500/30"
                : participant.rank === 2
                ? "bg-gray-300/10 border border-gray-300/30"
                : participant.rank === 3
                ? "bg-orange-500/10 border border-orange-500/30"
                : "bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg w-8 text-center">
                {participant.rank === 1 && (
                  <Crown className="h-5 w-5 text-yellow-500 inline" />
                )}
                {participant.rank === 2 && (
                  <Medal className="h-5 w-5 text-gray-400 inline" />
                )}
                {participant.rank === 3 && (
                  <Medal className="h-5 w-5 text-orange-500 inline" />
                )}
                {participant.rank > 3 && `#${participant.rank}`}
              </span>
              <div className="flex items-center gap-2">
                {participant.user?.avatar && (
                  <img
                    src={participant.user.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <span className="font-medium">
                  {(participant.user?.discriminator
                    ? `${participant.user.displayName || participant.user.username}#${participant.user.discriminator}`
                    : participant.user?.displayName || participant.user?.username) ||
                    "Anonyme"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {leagueFormat === "POINTS" && (
                <>
                  {participant.feats.length > 0 && (
                    <Badge variant="secondary">
                      {participant.feats.length} haut
                      {participant.feats.length > 1 ? "s" : ""} fait
                      {participant.feats.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                  <span className="font-bold text-lg">{participant.points} pts</span>
                </>
              )}

              {leagueFormat === "KILLER" && (
                <div className="text-sm text-right">
                  <div>
                    <span className="text-muted-foreground">Victoires :</span>{" "}
                    <span className="font-medium">{participant.wins ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Defaites :</span>{" "}
                    <span className="font-medium">{participant.losses ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ratio :</span>{" "}
                    <span className="font-medium">{(participant.ratio ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(data.page - 1)}
            disabled={data.page <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Precedent
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

function generatePaginationNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) {
      pages.push(i);
    }
    return pages;
  }

  pages.push(1);

  if (currentPage > 3) {
    pages.push("...");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i += 1) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("...");
  }

  pages.push(totalPages);

  return pages;
}