import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/mongodb";
import { createPlayGroupInvitation, getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getUserByEmail, getUserByTagOrId, getUsersByIds } from "@/lib/db/users";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  try {
    const { playGroupId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const memberIds = group.members.map((member) => member.userId);
    const users = await getUsersByIds(memberIds);
    const userById = new Map(users.map((user) => [user.id, user]));
    const currentMember = group.members.find((member) => member.userId === session.user.id);

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
      },
      currentUserRole: currentMember?.role || "member",
      members: group.members.map((member) => ({
        ...member,
        user: userById.get(member.userId) || null,
      })),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des membres du groupe", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  try {
    const { playGroupId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const body = await request.json();
    const userIdentifier = typeof body?.userIdentifier === "string" ? body.userIdentifier.trim() : "";

    if (!userIdentifier) {
      return NextResponse.json({ error: "L'identifiant de l'utilisateur est requis" }, { status: 400 });
    }

    const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const requesterMember = group.members.find((member) => member.userId === session.user.id);
    if (!requesterMember || (requesterMember.role !== "owner" && requesterMember.role !== "admin")) {
      return NextResponse.json({ error: "Vous n'avez pas les droits pour inviter des membres" }, { status: 403 });
    }

    const targetUser = userIdentifier.includes("@")
      ? await getUserByEmail(userIdentifier)
      : await getUserByTagOrId(userIdentifier);

    if (!targetUser) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (targetUser.id === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous inviter vous-même" }, { status: 400 });
    }

    const alreadyMember = group.members.some((member) => member.userId === targetUser.id);
    if (alreadyMember) {
      return NextResponse.json({ error: "Cet utilisateur est déjà membre du groupe" }, { status: 409 });
    }

    const existingInvitation = await db.collection("playGroupInvitations").findOne({
      playGroupId,
      invitedUserId: targetUser.id,
      status: "pending",
    });

    if (existingInvitation) {
      return NextResponse.json({ error: "Une invitation est déjà en attente" }, { status: 409 });
    }

    if (requesterMember.role === "admin") {
      const targetMember = group.members.find((member) => member.userId === targetUser.id);
      if (targetMember && (targetMember.role === "owner" || targetMember.role === "admin")) {
        return NextResponse.json({ error: "Un administrateur ne peut pas inviter un propriétaire ou un autre administrateur" }, { status: 403 });
      }
    }

    const invitation = await createPlayGroupInvitation({
      playGroupId: group.id,
      playGroupName: group.name,
      invitedUserId: targetUser.id,
      invitedById: session.user.id,
    });

    const now = new Date().toISOString();
    await db.collection("notifications").insertOne({
      _id: new ObjectId(),
      id: new ObjectId().toString(),
      type: "user",
      userId: targetUser.id,
      title: "Invitation à un groupe de jeu",
      description: `${session.user.name || session.user.email || "Quelqu'un"} vous a invité à rejoindre ${group.name}`,
      createdAt: now,
      playGroupId: group.id,
      playGroupName: group.name,
      target: "user",
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error("Erreur lors de l'invitation à rejoindre le groupe", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

