import type { Feat, PointsRules } from "@/lib/types/League";

/**
 * Barème d'une ligue POINTS : valeurs par défaut et lecture tolérante.
 *
 * Les ligues créées avant l'arrivée des tournois rattachés n'ont ni `draw` ni
 * table de rangs en base. Plutôt qu'une migration — qui figerait un choix pour
 * des ligues en cours — on lit le barème à travers `normalizePointsRules` :
 * un champ absent prend sa valeur par défaut, et une ligue existante continue
 * de marquer exactement comme avant.
 */

export const DEFAULT_POINTS_RULES: PointsRules = {
  participation: 0,
  victory: 2,
  defeat: 1,
  draw: 1,
  rankPoints: [],
  rankPointsBeyond: 0,
  feats: [],
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Hauts faits : on écarte les entrées inexploitables (sans id ou sans titre). */
function normalizeFeats(raw: unknown): Feat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((feat): feat is Feat => Boolean(feat) && typeof feat === "object")
    .filter((feat) => typeof feat.id === "string" && typeof feat.title === "string")
    .map((feat) => ({
      ...feat,
      points: finiteNumber(feat.points, 0),
    }));
}

/**
 * Complète un barème lu en base (ou saisi dans un formulaire) avec les valeurs
 * par défaut. Ne modifie jamais une valeur présente et valide.
 */
export function normalizePointsRules(raw: Partial<PointsRules> | undefined | null): PointsRules {
  return {
    participation: finiteNumber(raw?.participation, DEFAULT_POINTS_RULES.participation),
    victory: finiteNumber(raw?.victory, DEFAULT_POINTS_RULES.victory),
    defeat: finiteNumber(raw?.defeat, DEFAULT_POINTS_RULES.defeat),
    draw: finiteNumber(raw?.draw, DEFAULT_POINTS_RULES.draw),
    rankPoints: Array.isArray(raw?.rankPoints)
      ? raw.rankPoints.map((points) => finiteNumber(points, 0))
      : [],
    rankPointsBeyond: finiteNumber(raw?.rankPointsBeyond, DEFAULT_POINTS_RULES.rankPointsBeyond),
    feats: normalizeFeats(raw?.feats),
  };
}

/**
 * Points rapportés par un rang final de tournoi (1 = premier). Au-delà de la
 * table, tous les rangs valent `rankPointsBeyond` : une table courte suffit à
 * décrire « podium + participation ».
 */
export function pointsForRank(rules: PointsRules, rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  return rules.rankPoints[rank - 1] ?? rules.rankPointsBeyond;
}

export type LeagueMatchOutcome = "victory" | "draw" | "defeat";

/**
 * Issue d'un match de ligue pour un joueur.
 *
 * Le nul est reconnu au seul cas où *personne* n'a gagné. Des co-vainqueurs —
 * ce que produit une égalité de score sur un match de ligue — restent des
 * vainqueurs : les compter comme un nul réécrirait le classement de toutes les
 * ligues en cours au premier recalcul.
 */
export function outcomeForPlayer(winnerIds: string[], playerId: string): LeagueMatchOutcome {
  if (winnerIds.length === 0) return "draw";
  return winnerIds.includes(playerId) ? "victory" : "defeat";
}

/** Libellé persisté dans `pointsHistory.reason`. */
export const OUTCOME_REASONS: Record<LeagueMatchOutcome, string> = {
  victory: "Victoire",
  draw: "Match nul",
  defeat: "Défaite",
};

/** Points d'un match de ligue : participation + issue. */
export function pointsForOutcome(rules: PointsRules, outcome: LeagueMatchOutcome): number {
  const forOutcome =
    outcome === "victory" ? rules.victory : outcome === "draw" ? rules.draw : rules.defeat;
  return rules.participation + forOutcome;
}
