import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  listPlayerTournamentsForUser,
  listPlayerTournamentsPageForUser,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import type { TournamentStatus } from "@/lib/types/Tournament";
import { tournamentErrorResponse, unauthorizedResponse } from "../utils";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const STATUSES: TournamentStatus[] = ["draft", "in-progress", "completed"];

/** Une date de jour, `YYYY-MM-DD` : c'est ce qu'un sélecteur de date envoie. */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit être au format AAAA-MM-JJ");

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  /** Statuts retenus, séparés par des virgules. Absent = tous. */
  status: z.string().trim().min(1).max(60).optional(),
  gameId: z.string().trim().min(1).max(60).optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
});

/**
 * Tournois où l'utilisateur connecté est inscrit comme joueur. Contrairement à
 * la synchronisation par clé (POST /tournaments/sync), aucun secret n'est
 * requis : l'authentification par session (ou clé API) suffit.
 *
 * **Deux formes de réponse, et c'est délibéré.** Sans paramètre de pagination,
 * la liste complète est rendue telle qu'elle l'a toujours été — un tableau nu,
 * que lisent les applications déjà installées. Dès qu'un filtre ou une page est
 * demandé, la réponse devient une enveloppe paginée : un client qui pagine sait
 * lire un total, un client qui l'ignore n'a jamais à le rencontrer.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) return unauthorizedResponse();

  const params = request.nextUrl.searchParams;
  // Ce qui fait basculer la réponse en enveloppe paginée, lu sur la requête
  // elle-même : après validation, Zod garde les clés optionnelles absentes —
  // à `undefined`, mais présentes —, et les compter dirait « paginé » à tout
  // le monde, y compris à qui n'a rien demandé.
  const paginated = ["page", "limit", "search", "status", "gameId", "from", "to"].some(
    (key) => params.has(key)
  );

  const query = querySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    gameId: params.get("gameId") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { error: query.error.issues[0]?.message ?? "Paramètres invalides" },
      { status: 400 }
    );
  }

  try {
    if (!paginated) {
      const entries = await listPlayerTournamentsForUser(user.userId);
      return NextResponse.json(
        entries.map(({ tournament, player }) => ({ tournament, player: sanitizePlayer(player) }))
      );
    }

    const statuses = (query.data.status ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is TournamentStatus =>
        (STATUSES as string[]).includes(value)
      );

    const limit = query.data.limit ?? DEFAULT_LIMIT;
    const page = query.data.page ?? 1;

    const { entries, total } = await listPlayerTournamentsPageForUser(user.userId, {
      page,
      limit,
      search: query.data.search,
      statuses,
      gameId: query.data.gameId,
      from: query.data.from ? new Date(`${query.data.from}T00:00:00.000Z`) : undefined,
      // Borne haute incluse : « jusqu'au 12 » comprend la journée du 12.
      to: query.data.to ? new Date(`${query.data.to}T23:59:59.999Z`) : undefined,
    });

    return NextResponse.json({
      tournaments: entries.map(({ tournament, player }) => ({
        tournament,
        player: sanitizePlayer(player),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return tournamentErrorResponse(error);
  }
}
