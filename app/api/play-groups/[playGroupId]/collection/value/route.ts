import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser, isGameEnabledForPlayGroup } from "@/lib/db/play-groups";
import { getOwnedCardGameIds } from "@/lib/db/collection";
import { computeCollectionValues } from "@/lib/db/collection-values";
import { totalCollectionValue } from "@/lib/collection/value";

/**
 * Recalcule la valeur estimée de toute la collection d'un groupe de jeu.
 *
 * La collection est commune : n'importe quel membre y ajoute et en retire des
 * cartes, et c'est donc n'importe quel membre qui peut en redemander la valeur.
 * Rien n'est écrit sur les cartes, seulement le total du groupe.
 *
 * Les jeux désactivés pour le groupe sont écartés : l'écran ne les montre pas,
 * les estimer écrirait une valeur que personne ne verrait.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const owner = { type: "playGroup", id: group.id } as const;

  try {
    const gameIds = (await getOwnedCardGameIds(owner)).filter((gameId) =>
      isGameEnabledForPlayGroup(group, gameId.toString())
    );
    const values = await computeCollectionValues(owner, gameIds);

    return NextResponse.json({
      values: Object.fromEntries(values),
      value: totalCollectionValue([...values.values()]) ?? null,
    });
  } catch (error) {
    console.error("Error computing play-group collection value:", error);
    return NextResponse.json({ error: "Failed to compute collection value" }, { status: 500 });
  }
}
