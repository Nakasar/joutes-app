import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { findVisibleLair } from "@/lib/api/lairs";
import { countUsersFollowingLair, getUserById } from "@/lib/db/users";
import { lairHasPro } from "@/lib/subscriptions/access";

type Params = Promise<{ lairId: string }>;

/**
 * La fiche d'un lieu : sa vitrine, telle que la page web la rend.
 *
 * Le `Lair` est rendu tel quel — `toLair` en écarte déjà `proGrant`, dont le
 * motif est du texte libre écrit par l'équipe. Ce qui s'y ajoute ne vit pas sur
 * le document : `isPro` (**un booléen seul, jamais le motif**), le nombre
 * d'abonnés, et si l'appelant en fait partie.
 *
 * Session facultative : elle ouvre les lieux privés qu'on suit ou qu'on gère,
 * et renseigne `isFollowing`. Sans elle, seuls les lieux publics répondent.
 *
 * Un lieu privé hors de portée rend **404, jamais 403** : un 403 confirmerait
 * son existence, ce que sa confidentialité lui promet de taire.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { lairId } = await params;
    const viewer = await authenticateApiRequest(request);

    const lair = await findVisibleLair(lairId, viewer?.userId ?? null);
    if (!lair) {
      return NextResponse.json({ error: "Lieu introuvable" }, { status: 404 });
    }

    const [isPro, followersCount, user] = await Promise.all([
      lairHasPro(lairId),
      countUsersFollowingLair(lairId),
      viewer ? getUserById(viewer.userId) : null,
    ]);

    return NextResponse.json({
      ...lair,
      isPro,
      followersCount,
      isFollowing: user?.lairs?.includes(lairId) ?? false,
    });
  } catch (error) {
    console.error("Error fetching lair:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
