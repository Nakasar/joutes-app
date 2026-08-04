"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MatchStatDefinition } from "@/lib/tournaments/game-presets";
import type { TournamentGameResult, TournamentResultMode } from "@/lib/types/Tournament";

const DRAW_VALUE = "__draw__";

type Props = {
  matchId: string;
  matchPlayerIds: string[];
  playerName: (id: string) => string;
  resultMode: TournamentResultMode;
  bestOf: number;
  // Statistiques secondaires relevées par le jeu, saisies après le vainqueur.
  // Vide = la phase n'en relève pas.
  stats?: MatchStatDefinition[];
  // La phase exige la saisie des statistiques : une partie renseignée doit les
  // porter toutes, pour chaque joueur, sans quoi l'API refuse le résultat.
  requireStats?: boolean;
  submitting: boolean;
  submitLabel?: string;
  onSubmit: (games: TournamentGameResult[]) => void;
};

/**
 * Saisie partie par partie d'un best-of-n. En mode "selection", on désigne le
 * vainqueur de chaque partie (ou nul) ; en mode "points", on saisit les points
 * de chaque joueur. Seules les parties renseignées sont envoyées.
 *
 * Les statistiques secondaires (cartes d'objectif, blessures, points de
 * victoire…) se saisissent en plus du résultat : elles ne désignent jamais le
 * vainqueur, elles servent aux départages du classement.
 */
export function MatchGamesEditor({
  matchId,
  matchPlayerIds,
  playerName,
  resultMode,
  bestOf,
  stats = [],
  requireStats = false,
  submitting,
  submitLabel,
  onSubmit,
}: Props) {
  const t = useTranslations("Tournaments");
  const gameIndexes = Array.from({ length: bestOf }, (_, i) => i);

  // selection : vainqueur choisi par partie ("" = non renseignée, DRAW_VALUE = nul).
  const [winners, setWinners] = useState<string[]>(() => gameIndexes.map(() => ""));
  // points : points par joueur et par partie (chaîne pour l'input).
  const [points, setPoints] = useState<Record<string, string>[]>(() => gameIndexes.map(() => ({})));
  // stats : valeur par partie, joueur et clé de statistique (chaîne pour l'input).
  const [statValues, setStatValues] = useState<Record<string, Record<string, string>>[]>(() =>
    gameIndexes.map(() => ({}))
  );

  const setWinner = (gameIndex: number, value: string) =>
    setWinners((current) => current.map((w, i) => (i === gameIndex ? value : w)));

  const setPoint = (gameIndex: number, playerId: string, value: string) =>
    setPoints((current) =>
      current.map((row, i) => (i === gameIndex ? { ...row, [playerId]: value } : row))
    );

  const setStat = (gameIndex: number, playerId: string, key: string, value: string) =>
    setStatValues((current) =>
      current.map((row, i) =>
        i === gameIndex ? { ...row, [playerId]: { ...(row[playerId] ?? {}), [key]: value } } : row
      )
    );

  // Statistiques d'une partie, envoyées seulement si au moins une case est
  // remplie : une partie sans saisie ne doit pas créditer des zéros.
  const gameStats = (gameIndex: number): TournamentGameResult["stats"] => {
    if (stats.length === 0) return undefined;
    const row = statValues[gameIndex] ?? {};
    const filled = matchPlayerIds.some((id) => stats.some((stat) => (row[id]?.[stat.key] ?? "") !== ""));
    if (!filled) return undefined;
    const result: Record<string, Record<string, number>> = {};
    for (const id of matchPlayerIds) {
      result[id] = Object.fromEntries(
        stats.map((stat) => [stat.key, Number.parseInt(row[id]?.[stat.key] ?? "", 10) || 0])
      );
    }
    return result;
  };

  // Parties renseignées, donc envoyées : une issue choisie en mode selection,
  // au moins un point saisi en mode points.
  const reportedGameIndexes = gameIndexes.filter((gameIndex) =>
    resultMode === "selection"
      ? winners[gameIndex] !== ""
      : matchPlayerIds.some((id) => (points[gameIndex]?.[id] ?? "") !== "")
  );

  // Statistiques exigées par la phase : chaque partie renseignée les porte
  // toutes, pour chaque joueur. L'envoi est bloqué tant qu'il en manque, plutôt
  // que refusé par l'API une fois le formulaire refermé.
  const statsIncomplete =
    requireStats &&
    stats.length > 0 &&
    reportedGameIndexes.some((gameIndex) =>
      matchPlayerIds.some((id) =>
        stats.some((stat) => (statValues[gameIndex]?.[id]?.[stat.key] ?? "") === "")
      )
    );

  const buildGames = (): TournamentGameResult[] => {
    if (resultMode === "selection") {
      return winners
        .map((w, gameIndex) => ({ w, gameIndex }))
        .filter(({ w }) => w !== "")
        .map(({ w, gameIndex }) => {
          const gameStat = gameStats(gameIndex);
          return {
            winnerId: w === DRAW_VALUE ? null : w,
            ...(gameStat ? { stats: gameStat } : {}),
          };
        });
    }
    // points : on envoie les parties où au moins un point a été saisi.
    return points
      .map((row, gameIndex) => ({ row, gameIndex }))
      .filter(({ row }) => matchPlayerIds.some((id) => (row[id] ?? "") !== ""))
      .map(({ row, gameIndex }) => {
        const gamePoints: Record<string, number> = {};
        for (const id of matchPlayerIds) gamePoints[id] = Number.parseInt(row[id] ?? "", 10) || 0;
        const gameStat = gameStats(gameIndex);
        return { points: gamePoints, ...(gameStat ? { stats: gameStat } : {}) };
      });
  };

  return (
    <div className="space-y-3">
      {gameIndexes.map((gameIndex) => (
        <div key={gameIndex} className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground w-20">{t("gamesEditor.gameN", { number: gameIndex + 1 })}</span>
          {resultMode === "selection" ? (
            <Select
              value={winners[gameIndex]}
              onValueChange={(v) => setWinner(gameIndex, v)}
            >
              <SelectTrigger className="w-56" aria-label={t("gamesEditor.gameWinnerAria", { number: gameIndex + 1 })}>
                <SelectValue placeholder={t("gamesEditor.winnerPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {matchPlayerIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {playerName(id)}
                  </SelectItem>
                ))}
                <SelectItem value={DRAW_VALUE}>{t("gamesEditor.draw")}</SelectItem>
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
                    aria-label={t("gamesEditor.pointsAria", { name: playerName(id), number: gameIndex + 1 })}
                    value={points[gameIndex][id] ?? ""}
                    onChange={(e) => setPoint(gameIndex, id, e.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
          {stats.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-3 pl-20">
              {matchPlayerIds.map((id) => (
                <div key={id} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{playerName(id)}</span>
                  {stats.map((stat) => (
                    <Input
                      key={stat.key}
                      type="number"
                      min={0}
                      max={stat.max}
                      className="w-16"
                      placeholder={t(`matchStats.stats.${stat.labelKey}Short`)}
                      aria-label={t("gamesEditor.statAria", {
                        stat: t(`matchStats.stats.${stat.labelKey}`),
                        name: playerName(id),
                        number: gameIndex + 1,
                      })}
                      value={statValues[gameIndex]?.[id]?.[stat.key] ?? ""}
                      onChange={(e) => setStat(gameIndex, id, stat.key, e.target.value)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {stats.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t(requireStats ? "gamesEditor.statsRequiredHint" : "gamesEditor.statsHint", {
            stats: stats.map((stat) => t(`matchStats.stats.${stat.labelKey}`)).join(", "),
          })}
        </p>
      )}
      {statsIncomplete && (
        <p className="text-xs font-medium text-destructive">{t("gamesEditor.statsMissing")}</p>
      )}
      <Button
        onClick={() => onSubmit(buildGames())}
        disabled={submitting || statsIncomplete}
        data-match={matchId}
      >
        {submitLabel ?? t("common.save")}
      </Button>
    </div>
  );
}
