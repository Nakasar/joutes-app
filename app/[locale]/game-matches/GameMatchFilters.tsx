"use client";

import { Game } from "@/lib/types/Game";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GameMatchFiltersProps = {
  games: Game[];
  selectedGameId: string;
  onGameChange: (gameId: string) => void;
};

export default function GameMatchFilters({
  games,
  selectedGameId,
  onGameChange,
}: GameMatchFiltersProps) {
  return (
    <div className="flex gap-4 items-center">
      <div className="flex-1 max-w-xs">
        <Select value={selectedGameId} onValueChange={onGameChange}>
          <SelectTrigger>
            <SelectValue placeholder="Filtrer par jeu" />
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
    </div>
  );
}
