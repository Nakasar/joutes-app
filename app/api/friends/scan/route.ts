import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByFriendCode, getUserById, toPublicUser } from "@/lib/db/users";
import { areUsersFriends, addFriendsByCode } from "@/lib/db/friends";
import { notifyUser } from "@/lib/services/notifications";
import { isValidFriendCode } from "@/lib/utils/friend-codes";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const body = await request.json();
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code || !isValidFriendCode(code)) {
      return NextResponse.json({ error: "Code ami invalide" }, { status: 400 });
    }

    const targetUser = await getUserByFriendCode(code);

    if (!targetUser) {
      return NextResponse.json({ error: "Code ami introuvable" }, { status: 404 });
    }

    if (targetUser.id === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous ajouter vous-même" }, { status: 400 });
    }

    const alreadyFriends = await areUsersFriends(session.user.id, targetUser.id);
    if (alreadyFriends) {
      return NextResponse.json(
        { error: "Vous êtes déjà amis avec cet utilisateur", friend: toPublicUser(targetUser) },
        { status: 409 }
      );
    }

    await addFriendsByCode(session.user.id, targetUser.id);

    const currentUser = await getUserById(session.user.id);
    await notifyUser(
      targetUser.id,
      "Nouvel ami",
      `${currentUser?.displayName || currentUser?.username || "Quelqu'un"} vous a ajouté en scannant votre code ami`
    );

    return NextResponse.json({ friend: toPublicUser(targetUser) });
  } catch (error) {
    console.error("Erreur lors de l'ajout d'ami par code", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
