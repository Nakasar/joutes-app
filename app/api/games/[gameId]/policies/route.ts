import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {hasPermission} from "@/lib/db/permissions";
import {countAllPolicies, createPolicy, getAllPolicies, getPolicyById} from "@/lib/db/policies";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import {getGameBySlugOrId} from "@/lib/db/games";
import {createPolicySchema} from "@/lib/schemas/policy.schema";

export async function GET(request: NextRequest, {params}: { params: Promise<{ gameId: string }> }) {
  const {gameId} = await params;

  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;

  const game = await getGameBySlugOrId(gameId);

  if (!game) {
    return NextResponse.json({error: "Game not found"}, {status: 404});
  }

  const searchParams = new URL(request.url).searchParams;
  const search = searchParams.get('searchQuery') || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  const offset = (page - 1) * limit;

  const [policies, totalCount] = await Promise.all([
    getAllPolicies({gameId: game.id, offset, limit, userId, search, sortOrder: 'asc'}),
    countAllPolicies({gameId: game.id, search}),
  ]);

  return NextResponse.json(policies, {
    headers: {
      'x-page': page.toString(),
      'x-page-size': limit.toString(),
      'x-count': totalCount.toString(),
    },
  });
}

/**
 * Création d'une politique. Réservée aux comptes portant `policies:update` :
 * contrairement aux erratas, les politiques font autorité et ne sont pas
 * arbitrées par les votes.
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

  if (!(await hasPermission('policies:update'))) {
    return NextResponse.json({error: "Permission refusée"}, {status: 403});
  }

  const parsed = createPolicySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {error: parsed.error.issues[0]?.message || "Données invalides"},
      {status: 400},
    );
  }

  try {
    const policyId = await createPolicy({
      ...parsed.data,
      gameId: game.id,
      createdBy: session.user.id,
    });

    revalidatePath(`/games/${game.slug ?? gameId}/policies`);

    const policy = await getPolicyById(policyId, session.user.id, game.id);

    return NextResponse.json(policy ?? {id: policyId}, {status: 201});
  } catch (error) {
    console.error("Erreur lors de la création de la policy:", error);
    return NextResponse.json({error: "Erreur lors de la création de la policy"}, {status: 500});
  }
}
