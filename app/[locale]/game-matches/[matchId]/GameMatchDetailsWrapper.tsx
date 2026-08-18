"use client";

import { Suspense } from "react";
import { GameMatch } from "@/lib/types/GameMatch";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import GameMatchDetails from "./GameMatchDetails";
import { Card } from "@/components/ui/card";

type GameMatchDetailsWrapperProps = {
  match: GameMatch;
  games: Game[];
  lairs: Lair[];
  currentUserId: string;
};

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Card>
    </div>
  );
}

export default function GameMatchDetailsWrapper(props: GameMatchDetailsWrapperProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GameMatchDetails {...props} />
    </Suspense>
  );
}
