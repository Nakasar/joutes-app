import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlayerBySyncKey, getTournamentById } from "@/lib/db/tournaments";
import { tournamentErrorResponse } from "../utils";

const syncSchema = z.object({
  keys: z.array(z.string().startsWith("tpsk_")).min(1).max(50),
});

/**
 * Résout des clés de synchronisation joueur (stockées dans le localStorage du
 * navigateur) vers leurs tournois et joueurs. Les clés elles-mêmes servent
 * d'authentification : les clés inconnues sont ignorées silencieusement.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys } = syncSchema.parse(body);

    const entries = await Promise.all(
      [...new Set(keys)].map(async (key) => {
        const player = await getPlayerBySyncKey(key);
        if (!player) return null;

        const tournament = await getTournamentById(player.tournamentId);
        if (!tournament) return null;

        return {
          key,
          tournament: {
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            createdAt: tournament.createdAt,
          },
          player: {
            id: player.id,
            displayName: player.displayName,
            status: player.status,
          },
        };
      })
    );

    return NextResponse.json(entries.filter(Boolean));
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
