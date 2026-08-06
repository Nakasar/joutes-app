import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {hasPermission} from "@/lib/db/permissions";
import {getGameBySlugOrId} from "@/lib/db/games";
import {getPolicyById, voteOnPolicy} from "@/lib/db/policies";
import {policyVoteSchema} from "@/lib/schemas/policy.schema";

/**
 * Vote sur une politique. Revoter à l'identique retire le vote, comme sur le
 * web. Renvoie le décompte à jour.
 */
export async function POST(
  request: NextRequest,
  {params}: { params: Promise<{ gameId: string; policyId: string }> },
) {
  const {gameId, policyId} = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id) {
    return NextResponse.json({error: "Non authentifié"}, {status: 401});
  }

  if (!(await hasPermission("policies:vote"))) {
    return NextResponse.json({error: "Permission refusée"}, {status: 403});
  }

  const parsed = policyVoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {error: parsed.error.issues[0]?.message || "Données invalides"},
      {status: 400},
    );
  }

  // La politique doit appartenir au jeu du chemin, sinon le vote passerait par
  // n'importe quel jeu.
  const policy = await getPolicyById(policyId, session.user.id, game.id);
  if (!policy) {
    return NextResponse.json({error: "Policy not found"}, {status: 404});
  }

  try {
    const votes = await voteOnPolicy(policyId, session.user.id, parsed.data.vote);
    if (!votes) {
      return NextResponse.json({error: "Policy not found"}, {status: 404});
    }

    revalidatePath(`/games/${game.slug ?? gameId}/policies`);
    revalidatePath(`/policies/${policyId}`);

    return NextResponse.json({votes});
  } catch (error) {
    console.error("Erreur lors du vote sur la policy:", error);
    return NextResponse.json({error: "Erreur lors du vote"}, {status: 500});
  }
}
