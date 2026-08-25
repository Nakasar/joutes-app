import "server-only";

import { NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import { getPlayGroupById } from "@/lib/db/play-groups";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access";
import type { PlayGroup, PlayGroupMemberRole } from "@/lib/types/PlayGroup";

export type PlayGroupViewer = {
  group: PlayGroup;
  userId: string;
  role: PlayGroupMemberRole;
  canManage: boolean;
};

/**
 * La porte commune des routes de l'Établi : être membre du groupe.
 *
 * Reprise de `requireMember` (`play-groups/[playGroupId]/actions.ts`), avec le
 * même partage des rôles : un membre lit, propose, vote et répond ; publier une
 * annonce, trancher un sondage et gérer les membres reviennent au fondateur et
 * aux admins (`canManagePlayGroup`).
 *
 * **Ici 403 et non 404**, contrairement à la porte des lieux. L'existence d'un
 * groupe n'est pas un secret — sa vitrine est publique, et son adresse se
 * partage — c'est son intérieur qui l'est. Répondre 404 à un membre qui vient
 * de perdre son rôle lui ferait croire que le groupe a disparu.
 *
 * Rend une réponse d'erreur toute faite, ou le lecteur : l'appelant écrit
 * `if ("error" in gate) return gate.error;` et continue avec le reste.
 */
export async function readPlayGroupViewer(
  request: Request,
  playGroupId: string,
  options: { manage?: boolean } = {},
): Promise<PlayGroupViewer | { error: NextResponse }> {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return { error: NextResponse.json({ error: "Groupe introuvable" }, { status: 404 }) };
  }

  const role = readMemberRole(group, viewer.userId);
  if (!role) {
    return { error: NextResponse.json({ error: "Réservé aux membres du groupe" }, { status: 403 }) };
  }

  const canManage = canManagePlayGroup(role);
  if (options.manage && !canManage) {
    return {
      error: NextResponse.json(
        { error: "Action réservée aux responsables du groupe" },
        { status: 403 },
      ),
    };
  }

  return { group, userId: viewer.userId, role, canManage };
}

/** Le lecteur, sans exiger qu'il soit membre — pour ce qui est public. */
export async function readPlayGroupVisitor(
  request: Request,
  playGroupId: string,
): Promise<{ group: PlayGroup; userId: string | null; role: PlayGroupMemberRole | null } | null> {
  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  const viewer = await authenticateApiRequest(request);
  const userId = viewer?.userId ?? null;

  return { group, userId, role: readMemberRole(group, userId) };
}
