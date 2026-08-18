"use client";

import { useState } from "react";
import { GameMatch } from "@/lib/types/GameMatch";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import GameMatchList from "./GameMatchList";
import GameMatchFilters from "./GameMatchFilters";

type GameMatchesClientProps = {
  matches: GameMatch[];
  games: Game[];
  lairs: Lair[];
  currentUserId: string;
};

export default function GameMatchesClient({
  matches,
  games,
  lairs,
  currentUserId,
}: GameMatchesClientProps) {
  const [selectedGameId, setSelectedGameId] = useState<string>("all");

  const filteredMatches = selectedGameId === "all"
    ? matches
    : matches.filter((match) => match.gameId === selectedGameId);

  return (
    <div className="space-y-6">
      <GameMatchFilters
        games={games}
        selectedGameId={selectedGameId}
        onGameChange={setSelectedGameId}
      />
      <GameMatchList matches={filteredMatches} games={games} lairs={lairs} currentUserId={currentUserId} />
    </div>
  );
}
