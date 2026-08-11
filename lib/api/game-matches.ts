import "server-only";

import { getGameSummariesByIds } from "@/lib/db/games";
import { getLairsByIds } from "@/lib/db/lairs";
import type { GameMatch } from "@/lib/types/GameMatch";
import type { BattleReport } from "@/lib/types/Match";

/**
 * Mise en forme des parties pour l'API REST — celle que consomment les clients
 * qui n'ont pas la base sous la main (l'application mobile, les clés API).
 *
 * Deux partis pris :
 *
 *  - le **jeu** et le **lieu** sont rendus résolus (nom compris) plutôt qu'en
 *    identifiants nus. Une liste de parties sans nom de jeu obligerait chaque
 *    client à recharger le catalogue pour afficher une ligne ;
 *  - le **rapport de bataille** n'est complet que sur la fiche. En liste, seul
 *    le scénario est repris : les listes d'armée et la table de jeu pèsent
 *    lourd, et rien ne les affiche à ce niveau.
 */

export type GameMatchApiPlayer = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  /** Participant sans compte : son `id` n'ouvre aucun droit. */
  isGuest?: boolean;
  isWinner: boolean;
};

export type GameMatchApiSummary = {
  id: string;
  playedAt: string;
  createdBy: string;
  game: { id: string; name: string; slug: string | null } | null;
  lair: { id: string; name: string } | null;
  players: GameMatchApiPlayer[];
  winnerIds: string[];
  /** Présent = la partie est saisie en rapport de bataille. */
  battleReport?: { scenario?: string };
};

export type GameMatchApiDetail = Omit<GameMatchApiSummary, "battleReport"> & {
  battleReport?: BattleReport;
};

function toPlayers(match: GameMatch): GameMatchApiPlayer[] {
  const winners = new Set(match.winnerIds ?? []);

  return match.players.map((player) => ({
    id: player.userId,
    username: player.username,
    ...(player.displayName ? { displayName: player.displayName } : {}),
    ...(player.discriminator ? { discriminator: player.discriminator } : {}),
    ...(player.isGuest ? { isGuest: true } : {}),
    isWinner: winners.has(player.userId),
  }));
}

/**
 * Résout en une fois les jeux et les lieux de tout un lot de parties : une
 * liste de vingt parties ne doit pas coûter quarante requêtes.
 */
async function resolveReferences(matches: GameMatch[]) {
  const gameIds = Array.from(new Set(matches.map((match) => match.gameId)));
  const lairIds = Array.from(
    new Set(matches.map((match) => match.lairId).filter((id): id is string => Boolean(id)))
  );

  const [games, lairs] = await Promise.all([
    gameIds.length > 0 ? getGameSummariesByIds(gameIds) : Promise.resolve([]),
    lairIds.length > 0 ? getLairsByIds(lairIds) : Promise.resolve([]),
  ]);

  return {
    games: new Map(games.map((game) => [game.id, game])),
    lairs: new Map(lairs.map((lair) => [lair.id, lair])),
  };
}

export async function serializeGameMatches(matches: GameMatch[]): Promise<GameMatchApiSummary[]> {
  const { games, lairs } = await resolveReferences(matches);

  return matches.map((match) => {
    const game = games.get(match.gameId);
    const lair = match.lairId ? lairs.get(match.lairId) : undefined;

    return {
      id: match.id,
      playedAt: match.playedAt.toISOString(),
      createdBy: match.createdBy,
      game: game ? { id: game.id, name: game.name, slug: game.slug } : null,
      lair: lair ? { id: lair.id, name: lair.name } : null,
      players: toPlayers(match),
      winnerIds: match.winnerIds ?? [],
      ...(match.battleReport
        ? {
            battleReport: match.battleReport.scenario
              ? { scenario: match.battleReport.scenario }
              : {},
          }
        : {}),
    };
  });
}

export async function serializeGameMatch(match: GameMatch): Promise<GameMatchApiDetail> {
  const [summary] = await serializeGameMatches([match]);

  return {
    ...summary,
    ...(match.battleReport ? { battleReport: match.battleReport } : {}),
  };
}
