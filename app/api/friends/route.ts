import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById, getUserByUsername, getUsersByIds, toPublicUser } from "@/lib/db/users";
import { areUsersFriends, createFriendRequest, getPendingRequestBetween } from "@/lib/db/friends";
import { notifyUser } from "@/lib/services/notifications";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const currentUser = await getUserById(session.user.id);
    const friends = (await getUsersByIds(currentUser?.friends || [])).map(toPublicUser);

    return NextResponse.json({ friends });
  } catch (error) {
    console.error("Erreur lors de la récupération des amis", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";

    if (!username) {
      return NextResponse.json({ error: "Le nom d'utilisateur est requis" }, { status: 400 });
    }

    const targetUser = await getUserByUsername(username);

    if (!targetUser) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (targetUser.id === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous ajouter vous-même" }, { status: 400 });
    }

    const alreadyFriends = await areUsersFriends(session.user.id, targetUser.id);
    if (alreadyFriends) {
      return NextResponse.json({ error: "Vous êtes déjà amis avec cet utilisateur" }, { status: 409 });
    }

    const existingRequest = await getPendingRequestBetween(session.user.id, targetUser.id);
    if (existingRequest) {
      return NextResponse.json({ error: "Une demande d'ami est déjà en attente" }, { status: 409 });
    }

    const friendRequest = await createFriendRequest({
      requesterId: session.user.id,
      recipientId: targetUser.id,
    });

    const requester = await getUserById(session.user.id);
    await notifyUser(
      targetUser.id,
      "Nouvelle demande d'ami",
      `${requester?.displayName || requester?.username || "Quelqu'un"} souhaite devenir votre ami`
    );

    return NextResponse.json({ friendRequest }, { status: 201 });
  } catch (error) {
    console.error("Erreur lors de l'envoi de la demande d'ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
