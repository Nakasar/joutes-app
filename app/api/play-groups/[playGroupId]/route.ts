import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getUsersByIds } from "@/lib/db/users";

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

    return NextResponse.json({
      group: {
        ...group,
        members: group.members.map((member) => ({
          ...member,
          user: userById.get(member.userId) || null,
        })),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du groupe de jeu", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json({});
}
