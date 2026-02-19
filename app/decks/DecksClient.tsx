"use client";

import { useState, useEffect, useCallback } from "react";
import { Deck } from "@/lib/types/Deck";
import { Game } from "@/lib/types/Game";
import { PaginatedDecksResult } from "@/lib/db/decks";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Library, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2, Plus, ExternalLink } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import DecksFilters, { DecksFiltersValues } from "./DecksFilters";
import CreateDeckDialog from "./CreateDeckDialog";

type DecksClientProps = {
  initialData: PaginatedDecksResult;
  games: Game[];
  initialFilters: {
    gameId?: string;
  };
};

export default function DecksClient({ initialData, games, initialFilters }: DecksClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<PaginatedDecksResult>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<DecksFiltersValues>({
    search: "",
    gameId: initialFilters.gameId || "all",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const fetchDecks = useCallback(async (
    currentFilters: DecksFiltersValues,
    page: number = 1
  ) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.search) params.append("search", currentFilters.search);
      if (currentFilters.gameId !== "all") params.append("gameId", currentFilters.gameId);
      if (currentFilters.sortBy) params.append("sortBy", currentFilters.sortBy);
      if (currentFilters.sortOrder) params.append("sortOrder", currentFilters.sortOrder);
      params.append("page", page.toString());
      params.append("limit", "20");
      params.append("visibility", "private"); // On récupère seulement nos decks privés

      const response = await fetch(`/api/decks?${params.toString()}`);
      const result = await response.json();
      
      if (response.ok) {
        setData(result);
      } else {
        console.error("Error fetching decks:", result.error);
      }
    } catch (error) {
      console.error("Error fetching decks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when filters change
  useEffect(() => {
    fetchDecks(filters, 1);
  }, [filters, fetchDecks]);

  const handleFiltersChange = (newFilters: DecksFiltersValues) => {
    setFilters(newFilters);
    if (newFilters.gameId === "all") {
      router.push(pathname);
    } else {
      router.push(`${pathname}?gameId=${newFilters.gameId}`);
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchDecks(filters, newPage);
  };

  const handleDeckCreated = () => {
    setIsCreateDialogOpen(false);
    fetchDecks(filters, 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DecksFilters
          games={games}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          isLoading={isLoading}
        />
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau deck
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} deck{data.total > 1 ? "s" : ""} trouvé{data.total > 1 ? "s" : ""}
        </span>
        {isLoading && (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </span>
        )}
      </div>

      {/* Decks grid */}
      {data.decks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Library className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground mb-4">
              Aucun deck ne correspond à vos critères.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer mon premier deck
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} games={games} />
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

      <CreateDeckDialog
        games={games}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleDeckCreated}
      />
    </div>
  );
}

function DeckCard({ deck, games }: { deck: Deck; games: Game[] }) {
  const game = games.find((g) => g.id === deck.gameId);
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");

  return (
    <Link href={`/decks/${deck.id}`} className="group">
      <Card className="h-full overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <CardHeader>
          <div className="flex items-start justify-between gap-2 mb-2">
            <CardTitle className="text-xl group-hover:text-primary transition-colors line-clamp-2 flex-1">
              {deck.name}
            </CardTitle>
            <Badge variant={deck.visibility === "public" ? "default" : "secondary"}>
              {deck.visibility === "public" ? (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Public
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Privé
                </>
              )}
            </Badge>
          </div>
          {game && (
            <CardDescription className="flex items-center gap-2">
              {game.icon && (
                <img src={game.icon} alt={game.name} className="h-4 w-4 object-contain" />
              )}
              {game.name}
            </CardDescription>
          )}
        </CardHeader>

        {deck.description && (
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {deck.description}
            </p>
          </CardContent>
        )}

        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Modifié {updatedAt.toRelative()}</span>
          {deck.url && (
            <ExternalLink className="h-3 w-3" />
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}

// Fonction pour générer les numéros de page avec ellipses
function generatePaginationNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  
  if (totalPages <= 7) {
    // Si 7 pages ou moins, afficher toutes les pages
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Toujours afficher la première page
    pages.push(1);
    
    if (currentPage > 3) {
      pages.push("...");
    }
    
    // Afficher les pages autour de la page actuelle
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (currentPage < totalPages - 2) {
      pages.push("...");
    }
    
    // Toujours afficher la dernière page
    pages.push(totalPages);
  }
  
  return pages;
}
