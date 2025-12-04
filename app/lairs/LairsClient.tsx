"use client";

import { useState, useEffect, useCallback } from "react";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import { PaginatedLairsResult } from "@/lib/db/lairs";
import { searchLairsAction } from "./actions";
import LairsFilters, { LairsFiltersValues } from "./LairsFilters";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight, Gamepad2, Lock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type LairsClientProps = {
  initialData: PaginatedLairsResult;
  games: Game[];
};

export default function LairsClient({ initialData, games }: LairsClientProps) {
  const [data, setData] = useState<PaginatedLairsResult>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<LairsFiltersValues>({
    search: "",
    gameId: "all",
    nearLocation: undefined,
  });

  const fetchLairs = useCallback(async (
    currentFilters: LairsFiltersValues,
    page: number = 1
  ) => {
    setIsLoading(true);
    try {
      const result = await searchLairsAction({
        search: currentFilters.search || undefined,
        gameIds: currentFilters.gameId !== "all" ? [currentFilters.gameId] : undefined,
        nearLocation: currentFilters.nearLocation
          ? {
              longitude: currentFilters.nearLocation.longitude,
              latitude: currentFilters.nearLocation.latitude,
              maxDistanceMeters: currentFilters.nearLocation.maxDistanceKm * 1000,
            }
          : undefined,
        page,
        limit: 10,
      });
      setData(result);
    } catch (error) {
      console.error("Error fetching lairs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when filters change
  useEffect(() => {
    fetchLairs(filters, 1);
  }, [filters, fetchLairs]);

  const handleFiltersChange = (newFilters: LairsFiltersValues) => {
    setFilters(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    fetchLairs(filters, newPage);
  };

  return (
    <div className="space-y-6">
      <LairsFilters
        games={games}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        isLoading={isLoading}
      />

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} lieu{data.total > 1 ? "x" : ""} trouvé{data.total > 1 ? "s" : ""}
        </span>
        {isLoading && (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </span>
        )}
      </div>

      {/* Lairs grid */}
      {data.lairs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">
              Aucun lieu de jeu ne correspond à vos critères.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.lairs.map((lair) => (
            <LairCard key={lair.id} lair={lair} />
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
            {generatePaginationNumbers(data.page, data.totalPages).map((pageNum, index) => (
              pageNum === "..." ? (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">...</span>
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
            ))}
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

function LairCard({ lair }: { lair: Lair }) {
  return (
    <Link href={`/lairs/${lair.id}`} className="group">
      <Card className="h-full overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        {lair.banner ? (
          <div className="relative w-full h-48 overflow-hidden">
            <img
              src={lair.banner}
              alt={lair.name}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-primary/80 to-purple-600/80 flex items-center justify-center">
            <Gamepad2 className="h-16 w-16 text-white" />
          </div>
        )}

        <CardHeader>
          <CardTitle className="text-2xl group-hover:text-primary transition-colors line-clamp-2 flex items-center gap-2">
            {lair.isPrivate && <Lock className="h-5 w-5 text-muted-foreground" />}
            {lair.name}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="space-y-2">
            {lair.isPrivate && (
              <Badge variant="secondary" className="bg-muted">
                <Lock className="h-3 w-3 mr-1" />
                Privé
              </Badge>
            )}
            {lair.games.length > 0 && (
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary">
                  {lair.games.length} jeu{lair.games.length > 1 ? "x" : ""}
                </Badge>
              </div>
            )}
            {lair.address && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{lair.address}</span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button
            variant="ghost"
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
          >
            Voir les détails
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

function generatePaginationNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  
  if (totalPages <= 7) {
    // Show all pages
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);
    
    if (currentPage > 3) {
      pages.push("...");
    }
    
    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (currentPage < totalPages - 2) {
      pages.push("...");
    }
    
    // Always show last page
    pages.push(totalPages);
  }
  
  return pages;
}
