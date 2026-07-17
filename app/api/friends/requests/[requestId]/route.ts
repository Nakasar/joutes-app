import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { acceptFriendRequest, declineFriendRequest } from "@/lib/db/friends";
import { notifyUser } from "@/lib/services/notifications";
import { getUserById } from "@/lib/db/users";

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const friendRequest = await acceptFriendRequest(requestId, session.user.id);

    if (!friendRequest) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const recipient = await getUserById(session.user.id);
    await notifyUser(
      friendRequest.requesterId,
      "Demande d'ami acceptée",
      `${recipient?.displayName || recipient?.username || "Quelqu'un"} a accepté votre demande d'ami`
    );

    return NextResponse.json({ friendRequest });
  } catch (error) {
    console.error("Erreur lors de l'acceptation de la demande d'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const declined = await declineFriendRequest(requestId, session.user.id);

    if (!declined) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors du refus de la demande d'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
