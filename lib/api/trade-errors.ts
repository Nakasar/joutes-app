import { NextResponse } from "next/server";
import type { TradeActionResult, TradeError } from "@/lib/db/trades";

/** Statut HTTP correspondant à chaque échec d'une opération d'échange. */
const STATUS_BY_ERROR: Record<TradeError, number> = {
  "not-found": 404,
  forbidden: 403,
  closed: 409,
  conflict: 409,
  empty: 400,
  "side-taken": 409,
  "already-participant": 409,
  "self-trade": 400,
  "insufficient-copies": 409,
  "unknown-cards": 400,
};

/**
 * Réponse d'échec d'une opération d'échange. L'état de l'échange est renvoyé
 * quand il est connu, pour que le client puisse se resynchroniser sans
 * requête supplémentaire (conflit de révision, stock insuffisant...).
 */
export function tradeErrorResponse(result: Extract<TradeActionResult, { ok: false }>): NextResponse {
  return NextResponse.json(
    {
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
      ...(result.trade ? { trade: result.trade } : {}),
    },
    { status: STATUS_BY_ERROR[result.error] ?? 400 }
  );
}
