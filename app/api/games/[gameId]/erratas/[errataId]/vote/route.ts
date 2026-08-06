import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {hasPermission} from "@/lib/db/permissions";
import {getGameBySlugOrId} from "@/lib/db/games";
import {getErrataGameCardIds, voteOnErrata} from "@/lib/db/erratas";
import {errataVoteSchema} from "@/lib/schemas/errata.schema";

/**
 * Vote sur la pertinence d'un errata. Revoter à l'identique retire le vote,
 * comme sur le web. Renvoie le décompte à jour.
 */
export async function POST(
  request: NextRequest,
  {params}: { params: Promise<{ gameId: string; errataId: string }> },
) {
  const {gameId, errataId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id) {
    return NextResponse.json({error: "Non authentifié"}, {status: 401});
  }

  if (!(await hasPermission("erratas:vote"))) {
    return NextResponse.json({error: "Permission refusée"}, {status: 403});
  }

  const parsed = errataVoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {error: parsed.error.issues[0]?.message || "Données invalides"},
      {status: 400},
    );
  }

  // L'errata doit porter sur une carte du jeu du chemin, sinon on pourrait
  // voter sur n'importe quel errata via n'importe quel jeu existant.
  const cardIds = await getErrataGameCardIds(errataId, game.id);
  if (!cardIds) {
    return NextResponse.json({error: "Errata introuvable"}, {status: 404});
  }

  try {
    const votes = await voteOnErrata(errataId, session.user.id, parsed.data.vote);
    if (!votes) {
      return NextResponse.json({error: "Errata introuvable"}, {status: 404});
    }

    for (const cardId of cardIds) {
      revalidatePath(`/games/${game.slug ?? gameId}/cards/${cardId}`);
    }

    return NextResponse.json({votes});
  } catch (error) {
    console.error("Erreur lors du vote sur l'errata:", error);
    return NextResponse.json({error: "Erreur lors du vote"}, {status: 500});
  }
}
