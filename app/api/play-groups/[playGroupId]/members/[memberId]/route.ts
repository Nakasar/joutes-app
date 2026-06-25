import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser, removePlayGroupMember, updatePlayGroupMemberRole } from "@/lib/db/play-groups";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ playGroupId: string; memberId: string }> }) {
  try {
    const { playGroupId, memberId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const requesterMember = group.members.find((member) => member.userId === session.user.id);
    if (!requesterMember || requesterMember.role !== "owner") {
      return NextResponse.json({ error: "Seul le propriétaire peut modifier les rôles" }, { status: 403 });
    }

    const targetMember = group.members.find((member) => member.userId === memberId);
    if (!targetMember) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const role = body?.role;
    if (role !== "admin" && role !== "member") {
      return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
    }

    if (targetMember.userId === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, { status: 400 });
    }

    const updated = await updatePlayGroupMemberRole(playGroupId, memberId, role);
    if (!updated) {
      return NextResponse.json({ error: "Impossible de mettre à jour le rôle" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du rôle du membre", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ playGroupId: string; memberId: string }> }) {
  try {
    const { playGroupId, memberId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const requesterMember = group.members.find((member) => member.userId === session.user.id);
    if (!requesterMember || (requesterMember.role !== "owner" && requesterMember.role !== "admin")) {
      return NextResponse.json({ error: "Vous n'avez pas les droits pour retirer des membres" }, { status: 403 });
    }

    const targetMember = group.members.find((member) => member.userId === memberId);
    if (!targetMember) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    if (targetMember.userId === session.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous retirer vous-même depuis cette interface" }, { status: 400 });
    }

    if (requesterMember.role === "admin" && (targetMember.role === "owner" || targetMember.role === "admin")) {
      return NextResponse.json({ error: "Un administrateur ne peut pas retirer un propriétaire ou un autre administrateur" }, { status: 403 });
    }

    const removed = await removePlayGroupMember(playGroupId, memberId);
    if (!removed) {
      return NextResponse.json({ error: "Impossible de retirer le membre" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors du retrait du membre du groupe", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

