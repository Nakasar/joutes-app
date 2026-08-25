import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { findVisibleLair } from "@/lib/api/lairs";
import {
  addLairToUser,
  countUsersFollowingLair,
  removeLairFromUser,
} from "@/lib/db/users";

type Params = Promise<{ lairId: string }>;

/**
 * Suivre un lieu, ou cesser de le suivre.
 *
 * Deux verbes idempotents plutôt qu'une bascule, pour la raison qui vaut déjà
 * pour le suivi d'un joueur : deux envois partis d'un double toucher
 * laisseraient une bascule dans l'état contraire à celui voulu.
 *
 * `$addToSet` et `$pull` en base sont déjà idempotents : redemander ce qui est
 * fait ne change rien.
 *
 * Une exception assumée : cesser de suivre un lieu **privé** en ferme la porte,
 * et un second `DELETE` répond alors 404. C'est la seule réponse honnête — le
 * lieu a cessé d'être visible pour ce compte — et l'état reste celui voulu.
 */
async function setFollowing(
  request: NextRequest,
  params: Params,
  following: boolean,
) {
  const { lairId } = await params;
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Le lieu passe d'abord la porte : sans cela, `DELETE` puis `PUT` sur un lieu
  // privé quelconque suffirait à s'y inviter, et l'existence d'un lieu privé se
  // devinerait à ce que la requête réussisse.
  const lair = await findVisibleLair(lairId, viewer.userId);
  if (!lair) {
    return NextResponse.json({ error: "Lieu introuvable" }, { status: 404 });
  }

  if (following) {
    await addLairToUser(viewer.userId, lairId);
  } else {
    await removeLairFromUser(viewer.userId, lairId);
  }

  return NextResponse.json({
    following,
    followersCount: await countUsersFollowingLair(lairId),
  });
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    return await setFollowing(request, params, true);
  } catch (error) {
    console.error("Error following lair:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    return await setFollowing(request, params, false);
  } catch (error) {
    console.error("Error unfollowing lair:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
