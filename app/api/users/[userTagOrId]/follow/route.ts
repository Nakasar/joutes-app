import { NextResponse } from "next/server";
import { countUserFollowers, followUser, unfollowUser } from "@/lib/db/user-followers";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { findUserByParam } from "@/lib/api/users";

type Params = Promise<{ userTagOrId: string }>;

/**
 * Suivre un joueur, ou cesser de le suivre.
 *
 * Deux verbes idempotents plutôt qu'une bascule : un `POST /follow` qui inverse
 * l'état est une invitation au double envoi — deux requêtes parties d'un double
 * toucher laisseraient l'abonnement dans l'état inverse de celui qu'on voulait.
 * `PUT` veut dire « que je le suive », `DELETE` « que je ne le suive plus », et
 * les répéter ne change rien.
 *
 * Suivre est unilatéral : c'est ce qui le distingue de l'amitié, qui se demande
 * et s'accepte, et qui ouvre la collection et les parties.
 */
async function setFollowing(request: Request, params: Params, following: boolean) {
  const { userTagOrId } = await params;

  try {
    const viewer = await authenticateApiRequest(request);
    if (!viewer) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (user.id === viewer.userId) {
      return NextResponse.json({ error: "On ne se suit pas soi-même" }, { status: 400 });
    }

    const state = following
      ? await followUser(user.id, viewer.userId)
      : await unfollowUser(user.id, viewer.userId);

    return NextResponse.json({
      following: state,
      followersCount: await countUserFollowers(user.id),
    });
  } catch (error) {
    console.error("Error updating follow state:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export function PUT(request: Request, { params }: { params: Params }) {
  return setFollowing(request, params, true);
}

export function DELETE(request: Request, { params }: { params: Params }) {
  return setFollowing(request, params, false);
}
