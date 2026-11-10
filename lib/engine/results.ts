import type { GameTable } from "@/lib/types/GameTable";

/**
 * Ce qui relie une table à sa partie sur le serveur de parties : le nom de la
 * partie, et le résultat que le serveur annonce. Sans dépendance, pour être
 * testé seul.
 */

/** La partie d'une table sur le serveur de parties. */
export function engineGameId(table: Pick<GameTable, "id" | "engineId">): string {
  return table.engineId ?? table.id;
}

/** La table d'une partie du serveur de parties : son code est le début de l'identifiant. */
export function tableIdOfEngineGame(engineId: string): string {
  return engineId.split("-")[0];
}

export type EngineResult = { winners?: unknown; reason?: unknown };

/** Le résultat annoncé par le serveur de parties, ou `null` s'il est mal formé. */
export function parseEngineResult(
  result: EngineResult | null | undefined,
  turns: unknown,
  points: unknown,
): NonNullable<GameTable["result"]> | null {
  const winners = result?.winners;
  const seatNumbers = (value: unknown): value is number[] =>
    Array.isArray(value) && value.length <= 4 && value.every((n) => Number.isInteger(n) && n >= 0);
  if (!seatNumbers(winners) || winners.some((seat) => seat > 3) || typeof result?.reason !== "string") return null;
  return {
    winners,
    reason: result.reason.slice(0, 300),
    ...(typeof turns === "number" && Number.isFinite(turns) ? { turns } : {}),
    ...(seatNumbers(points) ? { points } : {}),
  };
}

