"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TournamentGameResult, TournamentResultMode } from "@/lib/types/Tournament";

const DRAW_VALUE = "__draw__";

type Props = {
  matchId: string;
  matchPlayerIds: string[];
  playerName: (id: string) => string;
  resultMode: TournamentResultMode;
  bestOf: number;
  submitting: boolean;
  submitLabel?: string;
  onSubmit: (games: TournamentGameResult[]) => void;
};

/**
 * Saisie partie par partie d'un best-of-n. En mode "selection", on désigne le
 * vainqueur de chaque partie (ou nul) ; en mode "points", on saisit les points
 * de chaque joueur. Seules les parties renseignées sont envoyées.
 */
export function MatchGamesEditor({
  matchId,
  matchPlayerIds,
  playerName,
  resultMode,
  bestOf,
  submitting,
  submitLabel = "Enregistrer",
  onSubmit,
}: Props) {
  const gameIndexes = Array.from({ length: bestOf }, (_, i) => i);

  // selection : vainqueur choisi par partie ("" = non renseignée, DRAW_VALUE = nul).
  const [winners, setWinners] = useState<string[]>(() => gameIndexes.map(() => ""));
  // points : points par joueur et par partie (chaîne pour l'input).
  const [points, setPoints] = useState<Record<string, string>[]>(() => gameIndexes.map(() => ({})));

  const setWinner = (gameIndex: number, value: string) =>
    setWinners((current) => current.map((w, i) => (i === gameIndex ? value : w)));

  const setPoint = (gameIndex: number, playerId: string, value: string) =>
    setPoints((current) =>
      current.map((row, i) => (i === gameIndex ? { ...row, [playerId]: value } : row))
    );

  const buildGames = (): TournamentGameResult[] => {
    if (resultMode === "selection") {
      return winners
        .filter((w) => w !== "")
        .map((w) => ({ winnerId: w === DRAW_VALUE ? null : w }));
    }
    // points : on envoie les parties où au moins un point a été saisi.
    return points
      .filter((row) => matchPlayerIds.some((id) => (row[id] ?? "") !== ""))
      .map((row) => {
        const gamePoints: Record<string, number> = {};
        for (const id of matchPlayerIds) gamePoints[id] = Number.parseInt(row[id] ?? "", 10) || 0;
        return { points: gamePoints };
      });
  };

  return (
    <div className="space-y-3">
      {gameIndexes.map((gameIndex) => (
        <div key={gameIndex} className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground w-20">Partie {gameIndex + 1}</span>
          {resultMode === "selection" ? (
            <Select
              value={winners[gameIndex]}
              onValueChange={(v) => setWinner(gameIndex, v)}
            >
              <SelectTrigger className="w-56" aria-label={`Vainqueur de la partie ${gameIndex + 1}`}>
                <SelectValue placeholder="Vainqueur…" />
              </SelectTrigger>
              <SelectContent>
                {matchPlayerIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {playerName(id)}
                  </SelectItem>
                ))}
                <SelectItem value={DRAW_VALUE}>Match nul</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {matchPlayerIds.map((id) => (
                <label key={id} className="flex items-center gap-1 text-sm">
                  <span>{playerName(id)}</span>
                  <Input
                    type="number"
                    className="w-16"
                    aria-label={`Points de ${playerName(id)} à la partie ${gameIndex + 1}`}
                    value={points[gameIndex][id] ?? ""}
                    onChange={(e) => setPoint(gameIndex, id, e.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button onClick={() => onSubmit(buildGames())} disabled={submitting} data-match={matchId}>
        {submitLabel}
      </Button>
    </div>
  );
}
