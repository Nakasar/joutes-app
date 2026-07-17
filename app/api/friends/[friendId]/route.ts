import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeFriend } from "@/lib/db/friends";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ friendId: string }> }) {
  try {
    const { friendId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const removed = await removeFriend(session.user.id, friendId);

    if (!removed) {
      return NextResponse.json({ error: "Cet utilisateur n'est pas dans votre liste d'amis" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
