"use client";

import { useState } from "react";
import { Game } from "@/lib/types/Game";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type DecksFiltersValues = {
  search: string;
  gameId: string;
  sortBy: "name" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
};

type DecksFiltersProps = {
  games: Game[];
  filters: DecksFiltersValues;
  onFiltersChange: (filters: DecksFiltersValues) => void;
  isLoading: boolean;
};

export default function DecksFilters({
  games,
  filters,
  onFiltersChange,
  isLoading,
}: DecksFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    // Debounce search
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, search: value });
    }, 500);
    return () => clearTimeout(timer);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Rechercher</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder="Nom ou description..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Game filter */}
        <div className="space-y-2">
          <Label htmlFor="game">Jeu</Label>
          <Select
            value={filters.gameId}
            onValueChange={(value) => onFiltersChange({ ...filters, gameId: value })}
            disabled={isLoading}
          >
            <SelectTrigger id="game">
              <SelectValue placeholder="Tous les jeux" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les jeux</SelectItem>
              {games.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort by */}
        <div className="space-y-2">
          <Label htmlFor="sortBy">Trier par</Label>
          <Select
            value={filters.sortBy}
            onValueChange={(value: "name" | "createdAt" | "updatedAt") =>
              onFiltersChange({ ...filters, sortBy: value })
            }
            disabled={isLoading}
          >
            <SelectTrigger id="sortBy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Date de modification</SelectItem>
              <SelectItem value="createdAt">Date de création</SelectItem>
              <SelectItem value="name">Nom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort order */}
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Ordre</Label>
          <Select
            value={filters.sortOrder}
            onValueChange={(value: "asc" | "desc") =>
              onFiltersChange({ ...filters, sortOrder: value })
            }
            disabled={isLoading}
          >
            <SelectTrigger id="sortOrder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Décroissant</SelectItem>
              <SelectItem value="asc">Croissant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
