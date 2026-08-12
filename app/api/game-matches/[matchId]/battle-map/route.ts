import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { normalizeBattleMap } from "@/lib/battle-reports/battle-map";
import { getGameMatchById, setGameMatchBattleMap } from "@/lib/db/game-matches";
import { participantIds } from "@/lib/matches/participants";
import { battleMapSchema } from "@/lib/schemas/game-match.schema";

/**
 * Table de jeu d'un rapport de bataille, écrite **d'un bloc**.
 *
 * Pendant du `updateBattleMapAction` de l'application web, pour les clients qui
 * n'ont pas les actions serveur sous la main — l'application mobile, les clés
 * API. Trois choses lui sont propres, et elles viennent toutes du modèle :
 *
 *  - **d'un bloc, et non champ par champ** comme le scénario ou les notes : les
 *    pièces de la table se tiennent les unes les autres, et un décor déplacé
 *    sans son instant ne veut rien dire ;
 *  - **le créateur seul.** C'est un dessin unique : deux joueurs qui bougeraient
 *    des jetons dans le même instant ne s'écraseraient pas un champ, ils
 *    repositionneraient toute la partie ;
 *  - **ce qui dépasse est ramené, pas refusé.** La normalisation ramène les
 *    jetons sur le plateau et plafonne décors, jetons et instants ; le schéma
 *    n'écarte ensuite que ce qui n'a pas la bonne forme. Un rapport ne doit pas
 *    devenir inenregistrable parce que sa table a changé de taille.
 *
 * La table normalisée est renvoyée : le client sait ainsi ce qui a été retenu,
 * sans avoir à recharger la fiche.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const user = await authenticateApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { matchId } = await params;
  if (!/^[0-9a-fA-F]{24}$/.test(matchId)) {
    return NextResponse.json({ error: "Partie non trouvée" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  // La table est attendue sous `map`, et seulement là : la réponse la rend sous
  // la même clé, et accepter en plus l'objet nu donnerait deux formes à décrire
  // pour un endpoint qui n'a qu'un appelant.
  const parsed = battleMapSchema.safeParse((body as { map?: unknown } | null)?.map);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }

  try {
    const match = await getGameMatchById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Partie non trouvée" }, { status: 404 });
    }

    if (!match.battleReport) {
      return NextResponse.json(
        { error: "Cette partie n'est pas un rapport de bataille" },
        { status: 400 }
      );
    }

    if (match.createdBy !== user.userId) {
      return NextResponse.json(
        { error: "Seul le créateur peut modifier la table de jeu" },
        { status: 403 }
      );
    }

    const normalized = normalizeBattleMap(parsed.data, participantIds(match));
    // Re-passage par le schéma : la normalisation ramène des valeurs, elle ne
    // garantit pas la forme d'une entrée exotique qui l'aurait traversée.
    const validated = battleMapSchema.safeParse(normalized);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }

    const updated = await setGameMatchBattleMap(matchId, validated.data);
    if (!updated) {
      return NextResponse.json(
        { error: "Erreur lors de la mise à jour de la table de jeu" },
        { status: 500 }
      );
    }

    return NextResponse.json({ map: validated.data });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la table de jeu:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
