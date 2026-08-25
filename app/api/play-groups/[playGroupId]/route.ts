import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readPlayGroupVisitor } from "@/lib/api/play-groups";
import {
  countPlayGroupFollowers,
  getPlayGroupByIdAndUser,
  updatePlayGroupEnabledGames,
} from "@/lib/db/play-groups";
import { getUsersByIds } from "@/lib/db/users";
import { readPlayGroupVisibility } from "@/lib/play-groups/access";
import { playGroupGamesSchema } from "@/lib/schemas/play-group.schema";

/**
 * La fiche d'un groupe.
 *
 * **Deux formes, selon qui demande.** Cette route exigeait d'être membre, ce
 * qui n'a plus de sens depuis que la vitrine d'un groupe est publique : un
 * visiteur à qui l'on partage l'adresse doit pouvoir lire de quoi il s'agit.
 *
 * Un membre reçoit le groupe entier, la liste de ses membres hydratée comprise.
 * Un visiteur reçoit une **forme allégée** — nom, description, visibilité,
 * personnalisation, nombre de membres et d'abonnés — et jamais la liste des
 * membres : qui joue avec qui n'est pas une information publique, et un groupe
 * privé n'a pas à livrer son annuaire à qui devine son identifiant.
 *
 * La vitrine complète, avec ses annonces publiques et ses contenus, se lit par
 * `GET /play-groups/{playGroupId}/showcase`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  try {
    const { playGroupId } = await params;

    const visitor = await readPlayGroupVisitor(request, playGroupId);
    if (!visitor) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const { group, role } = visitor;

    if (!role) {
      return NextResponse.json({
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: readPlayGroupVisibility(group),
          enabledGameIds: group.enabledGameIds,
          // La personnalisation seule : ni annonces, ni contenus, ni directs.
          // Ce que la vitrine en montre lui appartient, et elle a sa route.
          options: group.options?.theme || group.options?.links || group.options?.rhythm
            ? {
                theme: group.options?.theme,
                links: group.options?.links,
                rhythm: group.options?.rhythm,
              }
            : undefined,
          memberCount: group.members.length,
          followerCount: await countPlayGroupFollowers(playGroupId),
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          isMember: false,
        },
      });
    }

    const memberIds = group.members.map((member) => member.userId);
    const users = await getUsersByIds(memberIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    return NextResponse.json({
      group: {
        ...group,
        visibility: readPlayGroupVisibility(group),
        members: group.members.map((member) => ({
          ...member,
          user: userById.get(member.userId) || null,
        })),
        memberCount: group.members.length,
        followerCount: await countPlayGroupFollowers(playGroupId),
        isMember: true,
        role,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du groupe de jeu", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
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

    const requesterMember = group.members.find((member) => member.userId === session.user.id);
    if (!requesterMember || (requesterMember.role !== "owner" && requesterMember.role !== "admin")) {
      return NextResponse.json({ error: "Action réservée aux responsables du groupe" }, { status: 403 });
    }

    const body = await request.json();
    const validate = playGroupGamesSchema.safeParse(body);
    if (!validate.success) {
      return NextResponse.json({ error: "Données invalides", details: validate.error }, { status: 400 });
    }

    const updated = await updatePlayGroupEnabledGames(playGroupId, validate.data.enabledGameIds);
    if (!updated) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const memberIds = updated.members.map((member) => member.userId);
    const users = await getUsersByIds(memberIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    return NextResponse.json({
      group: {
        ...updated,
        members: updated.members.map((member) => ({
          ...member,
          user: userById.get(member.userId) || null,
        })),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du groupe de jeu", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
