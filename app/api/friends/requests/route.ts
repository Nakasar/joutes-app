import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPendingFriendRequestsForUser } from "@/lib/db/friends";
import { getUsersByIds, toPublicUser } from "@/lib/db/users";
import { getUserBadges, NO_BADGES } from "@/lib/db/user-badges";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const requests = await getPendingFriendRequestsForUser(session.user.id);
    const requesterIds = requests.map((r) => r.requesterId);

    // Les deux lectures ensemble : les badges ne dépendent que des
    // identifiants, déjà connus. Et en lot — un appel par demande ferait un N+1.
    const [users, badges] = await Promise.all([
      getUsersByIds(requesterIds),
      getUserBadges(requesterIds),
    ]);

    const requesterById = new Map(
      users.map((user) => [user.id, { ...toPublicUser(user), badges: badges[user.id] ?? NO_BADGES }])
    );

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, requester: requesterById.get(r.requesterId) || null })),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des demandes d'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
