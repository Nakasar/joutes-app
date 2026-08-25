import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import {
  countPlayGroupFollowers,
  followPlayGroup,
  getPlayGroupById,
  unfollowPlayGroup,
} from "@/lib/db/play-groups";

type Params = Promise<{ playGroupId: string }>;

/**
 * Suivre la vitrine d'un groupe, ou cesser de la suivre.
 *
 * Deux verbes idempotents plutôt qu'une bascule, comme pour le suivi d'un
 * joueur ou d'un lieu : deux envois partis d'un double toucher laisseraient une
 * bascule dans l'état contraire à celui voulu.
 *
 * **Un groupe privé se suit aussi**, et ce n'est pas une faille : sa vitrine
 * est ouverte à qui en a l'adresse — c'est ce qui permet d'inviter quelqu'un à
 * la regarder — et seule sa présence au rôle d'armes lui est retirée. Suivre ne
 * donne aucun accès à l'intérieur du groupe.
 *
 * Suivre n'est pas être membre : un membre n'a rien à suivre, il est dedans.
 * Rien ne l'en empêche pour autant — l'abonnement et l'appartenance sont deux
 * listes distinctes, et forcer l'une à exclure l'autre compliquerait les deux.
 */
async function setFollowing(request: NextRequest, params: Params, following: boolean) {
  const { playGroupId } = await params;
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  if (following) {
    await followPlayGroup(playGroupId, viewer.userId);
  } else {
    await unfollowPlayGroup(playGroupId, viewer.userId);
  }

  return NextResponse.json({
    following,
    followerCount: await countPlayGroupFollowers(playGroupId),
  });
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    return await setFollowing(request, params, true);
  } catch (error) {
    console.error("Error following a play group:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    return await setFollowing(request, params, false);
  } catch (error) {
    console.error("Error unfollowing a play group:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
