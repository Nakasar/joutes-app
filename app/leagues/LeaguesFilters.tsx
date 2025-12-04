"use client";

import { useState, useEffect } from "react";
import { Game } from "@/lib/types/Game";
import { LeagueFormat, LeagueStatus } from "@/lib/types/League";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type LeaguesFiltersValues = {
  search: string;
  format: LeagueFormat | "all";
  status: LeagueStatus | "all";
  gameId: string;
};

type LeaguesFiltersProps = {
  games: Game[];
  filters: LeaguesFiltersValues;
  onFiltersChange: (filters: LeaguesFiltersValues) => void;
  isLoading?: boolean;
};

export default function LeaguesFilters({
  games,
  filters,
  onFiltersChange,
  isLoading,
}: LeaguesFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFiltersChange]);

  const handleFormatChange = (format: string) => {
    onFiltersChange({ ...filters, format: format as LeagueFormat | "all" });
  };

  const handleStatusChange = (status: string) => {
    onFiltersChange({ ...filters, status: status as LeagueStatus | "all" });
  };

  const handleGameChange = (gameId: string) => {
    onFiltersChange({ ...filters, gameId });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une ligue..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-10"
          disabled={isLoading}
        />
      </div>

      {/* Format filter */}
      <Select value={filters.format} onValueChange={handleFormatChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Format" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les formats</SelectItem>
          <SelectItem value="POINTS">Points</SelectItem>
          <SelectItem value="KILLER">Killer</SelectItem>
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select value={filters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          <SelectItem value="OPEN">Inscriptions ouvertes</SelectItem>
          <SelectItem value="IN_PROGRESS">En cours</SelectItem>
          <SelectItem value="COMPLETED">Terminée</SelectItem>
        </SelectContent>
      </Select>

      {/* Game filter */}
      <Select value={filters.gameId} onValueChange={handleGameChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Jeu" />
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
  );
}
