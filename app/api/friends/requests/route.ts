import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPendingFriendRequestsForUser } from "@/lib/db/friends";
import { getUsersByIds } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const requests = await getPendingFriendRequestsForUser(session.user.id);
    const requesters = await getUsersByIds(requests.map((r) => r.requesterId));
    const requesterById = new Map(requesters.map((user) => [user.id, user]));

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, requester: requesterById.get(r.requesterId) || null })),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des demandes d'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
