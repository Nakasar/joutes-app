"use client";

import { useState } from "react";
import { GameMatch } from "@/lib/types/GameMatch.ts";
import { Game } from "@/lib/types/Game.ts";
import { Lair } from "@/lib/types/Lair.ts";
import GameMatchList from "./GameMatchList.tsx";
import GameMatchFilters from "./GameMatchFilters.tsx";

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
