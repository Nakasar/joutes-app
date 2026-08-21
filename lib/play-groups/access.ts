import type { PlayGroup, PlayGroupMemberRole, PlayGroupVisibility } from "@/lib/types/PlayGroup";

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

/**
 * La visibilité du groupe, champ absent compris.
 *
 * Tous les groupes antérieurs à ce réglage n'ont pas le champ : les lire comme
 * publics est le seul choix qui ne change rien pour eux. Ce repli est écrit ici
 * une fois pour que personne n'ait à s'en souvenir ailleurs.
 */
export function readPlayGroupVisibility(group: Pick<PlayGroup, "visibility">): PlayGroupVisibility {
  return group.visibility === "private" ? "private" : "public";
}

/**
 * Le groupe doit-il paraître au rôle d'armes pour ce lecteur ?
 *
 * Un groupe privé n'y figure que pour ses membres. Le filtre est appliqué en
 * base, pas ici — un groupe privé ne doit pas seulement être caché à l'écran,
 * il ne doit pas quitter la base. Cette fonction dit la règle et sert à la
 * vérifier ; c'est la requête qui l'applique.
 */
export function isPlayGroupListable(
  group: Pick<PlayGroup, "visibility" | "members">,
  userId: string | null | undefined,
): boolean {
  return readPlayGroupVisibility(group) === "public" || readMemberRole(group, userId) !== null;
}

/**
 * Le filtre Mongo du rôle d'armes.
 *
 * Écrit ici, à côté de la règle qu'il applique, plutôt que dans la couche
 * base : c'est une décision de visibilité, et la garder collée à
 * `isPlayGroupListable` est ce qui permet de vérifier que les deux disent la
 * même chose.
 *
 * `$ne` retient les documents où le champ est absent — c'est ce qui laisse
 * visibles, sans migration, tous les groupes créés avant ce réglage.
 */
export function readRollFilter(userId: string | null | undefined): Record<string, unknown> {
  const visible = { visibility: { $ne: "private" } };

  return userId ? { $or: [visible, { "members.userId": userId }] } : visible;
}
