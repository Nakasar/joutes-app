import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {getGameBySlugOrId} from "@/lib/db/games";
import {
  countErratasByGameId,
  createErrata,
  ErrataInputError,
  getErratasByCardId,
  getErratasByGameId,
} from "@/lib/db/erratas";
import {createErrataSchema} from "@/lib/schemas/errata.schema";

export async function GET(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const searchParams = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  const [erratas, totalCount] = await Promise.all([
    getErratasByGameId({gameId: game.id, offset, limit, userId}),
    countErratasByGameId(game.id),
  ]);

  return NextResponse.json(erratas, {
    headers: {
      'x-page': page.toString(),
      'x-page-size': limit.toString(),
      'x-count': totalCount.toString(),
    },
  });
}

/**
 * Création d'un errata, ouverte à tout utilisateur connecté : les erratas sont
 * un contenu communautaire, arbitré par les votes et les signalements.
 */
export async function POST(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id) {
    return NextResponse.json({error: "Non authentifié"}, {status: 401});
  }

  const parsed = createErrataSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {error: parsed.error.issues[0]?.message || "Données invalides"},
      {status: 400},
    );
  }

  try {
    const {id, cardIds} = await createErrata({
      ...parsed.data,
      errataDate: parsed.data.errataDate ?? new Date(),
      createdBy: session.user.id,
      gameId: game.id,
    });

    for (const cardId of cardIds) {
      revalidatePath(`/games/${game.slug ?? gameId}/cards/${cardId}`);
    }

    // L'errata créé est relu par carte plutôt que renvoyé tel quel : l'appelant
    // récupère ainsi la même forme (`votes`, cartes jointes) que sur les
    // lectures, sans avoir à recharger la fiche.
    const created = (await getErratasByCardId(cardIds[0], session.user.id)).find((e) => e.id === id);

    return NextResponse.json(created ?? {id}, {status: 201});
  } catch (error) {
    if (error instanceof ErrataInputError) {
      return NextResponse.json({error: error.message}, {status: 400});
    }
    console.error("Erreur lors de la création de l'errata:", error);
    return NextResponse.json({error: "Erreur lors de la création de l'errata"}, {status: 500});
  }
}
