import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { serializeGameMatch, serializeGameMatches } from "@/lib/api/game-matches";
import { normalizeBattleReport } from "@/lib/battle-reports/army";
import { createGameMatch, getGameMatchesPageByUser } from "@/lib/db/game-matches";
import { getUserById } from "@/lib/db/users";
import { guestId, normalizeGuests } from "@/lib/matches/participants";
import { gameMatchApiCreateSchema } from "@/lib/schemas/game-match.schema";

/** Au-delà, la liste n'est plus consultée mais aspirée. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

/** Une date de jour, `YYYY-MM-DD` : c'est ce qu'un sélecteur de date envoie. */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit être au format AAAA-MM-JJ");

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  gameId: z.string().trim().min(1).max(60).optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
});

/**
 * Parties de l'utilisateur connecté, de la plus récente à la plus ancienne.
 *
 * « Ses » parties au sens large : celles qu'il a créées comme celles où il a
 * été inscrit par quelqu'un d'autre.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const query = listQuerySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
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

  const limit = query.data.limit ?? DEFAULT_LIMIT;
  const page = query.data.page ?? 1;

  try {
    const { matches, total } = await getGameMatchesPageByUser({
      userId: user.userId,
      page,
      limit,
      gameId: query.data.gameId,
      from: query.data.from ? new Date(`${query.data.from}T00:00:00.000Z`) : undefined,
      // Borne haute incluse : filtrer « jusqu'au 12 » sur un instant à minuit
      // écarterait toutes les parties du 12.
      to: query.data.to ? new Date(`${query.data.to}T23:59:59.999Z`) : undefined,
    });

    // `matches` reste la clé de tête : c'est celle que lisent les clients
    // déjà installés, qui ignoreront simplement le reste.
    return NextResponse.json({
      matches: await serializeGameMatches(matches),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des parties:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * Enregistre une partie. Le créateur en fait partie sans avoir à se citer :
 * on ne note pas une partie à laquelle on n'a pas participé, et l'oubli
 * produirait une partie dont l'auteur n'est pas joueur.
 */
export async function POST(request: NextRequest) {
  const user = await authenticateApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = gameMatchApiCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    // Les comptes cités sont vérifiés un par un : un identifiant bien formé
    // n'est pas encore un utilisateur, et inscrire un inconnu dans une partie
    // lui en donnerait l'accès sans qu'il existe.
    const others = Array.from(new Set(input.playerIds ?? [])).filter((id) => id !== user.userId);
    const existing = await Promise.all(others.map((id) => getUserById(id)));
    const unknown = others.filter((_, index) => existing[index] === null);
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Joueur introuvable : ${unknown[0]}` },
        { status: 400 }
      );
    }

    const playerIds = [user.userId, ...others];

    // Un invité peut arriver sans identifiant : le client qui n'a rien à y
    // accrocher n'a pas à en inventer un. Ceux qui en fournissent un — pour
    // désigner un vainqueur ou porter une liste d'armée — le gardent.
    const guests = normalizeGuests(
      (input.guests ?? []).map((guest) => ({
        id: guest.id ?? guestId(nanoid(12)),
        name: guest.name,
      }))
    );

    const participants = [...playerIds, ...guests.map((guest) => guest.id)];
    const known = new Set(participants);

    const battleReport = input.battleReport
      ? normalizeBattleReport(input.battleReport, participants)
      : undefined;

    // Un vainqueur qui n'est pas à la table n'a rien gagné : les identifiants
    // qui ne retombent sur aucun participant sont écartés plutôt que stockés.
    const winnerIds = Array.from(new Set(input.winnerIds ?? [])).filter((id) => known.has(id));

    const match = await createGameMatch({
      gameId: input.gameId,
      playedAt: input.playedAt ?? new Date(),
      ...(input.lairId ? { lairId: input.lairId } : {}),
      playerIds,
      ...(guests.length > 0 ? { guests } : {}),
      ...(winnerIds.length > 0 ? { winnerIds } : {}),
      ...(battleReport ? { battleReport } : {}),
      createdBy: user.userId,
    });

    return NextResponse.json(await serializeGameMatch(match), { status: 201 });
  } catch (error) {
    console.error("Erreur lors de la création de la partie:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
