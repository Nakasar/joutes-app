import type { PlayGroup, PlayGroupMemberRole } from "@/lib/types/PlayGroup";

/** Le rôle du visiteur dans le groupe, ou `null` s'il n'en est pas membre. */
export function readMemberRole(
  group: Pick<PlayGroup, "members">,
  userId: string | null | undefined,
): PlayGroupMemberRole | null {
  if (!userId) {
    return null;
  }

  return group.members.find((member) => member.userId === userId)?.role ?? null;
}

/**
 * Publier une annonce, confirmer un sondage, retirer un direct, gérer les
 * membres et la personnalisation : tout cela est réservé au fondateur et aux
 * admins. Un membre lit, répond aux sessions et alimente les listes.
 */
export function canManagePlayGroup(role: PlayGroupMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}
