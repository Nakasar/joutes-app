import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth.ts";
import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import { listPlayGroupSessions } from "@/lib/db/play-group-sessions.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getUsersByIds } from "@/lib/db/users.ts";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access.ts";
import type { Game } from "@/lib/types/Game";
import type { PlayGroup, PlayGroupContentItem } from "@/lib/types/PlayGroup";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";

/**
 * Le groupe, lu une fois par rendu.
 *
 * Le groupe lui-même est lisible sans être membre : sa vitrine est publique,
 * et c'est chaque vue qui décide de ce qu'elle montre à qui. Le tri se fait
 * donc dans `readGroupViewer`, jamais ici.
 */
export const requirePlayGroup = cache(async (playGroupId: string): Promise<PlayGroup> => {
  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    notFound();
  }

  return group;
});

/** La session et les droits sur ce groupe, une fois par rendu. */
export const readGroupViewer = cache(async (playGroupId: string) => {
  const group = await requirePlayGroup(playGroupId);
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  const role = readMemberRole(group, userId);

  return {
    userId,
    role,
    isMember: role !== null,
    canManage: canManagePlayGroup(role),
  };
});

/**
 * Le hub est réservé aux membres.
 *
 * Un visiteur n'y est pas renvoyé vers une page d'erreur : il est envoyé sur
 * la vitrine, qui est faite pour lui. C'est le seul endroit où ce détour est
 * décidé — chaque vue du hub l'appelle en tête.
 */
export const requirePlayGroupMember = cache(async (playGroupId: string) => {
  const viewer = await readGroupViewer(playGroupId);
  if (!viewer.isMember) {
    notFound();
  }

  return viewer;
});

/** Les membres du groupe, avec leur profil — l'avatar et le nom affichés partout. */
export const readGroupMembers = cache(async (playGroupId: string) => {
  const group = await requirePlayGroup(playGroupId);
  const users = await getUsersByIds(group.members.map((member) => member.userId));
  const userById = new Map(users.map((user) => [user.id, user]));

  return group.members.map((member) => {
    const user = userById.get(member.userId);

    return {
      ...member,
      displayName: user?.displayName || user?.username || user?.email || member.userId,
      username: user?.username,
      avatar: user?.avatar,
    };
  });
});

export type PlayGroupMemberProfile = Awaited<ReturnType<typeof readGroupMembers>>[number];

/** Le nom affichable d'un membre, ou son identifiant en dernier recours. */
export function memberName(members: PlayGroupMemberProfile[], userId: string): string {
  return members.find((member) => member.userId === userId)?.displayName ?? userId;
}

/** Les contenus publiés, les plus récents d'abord. */
export function sortContents(contents: PlayGroupContentItem[]): PlayGroupContentItem[] {
  return [...contents].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export const readGroupSessions = cache(async (playGroupId: string): Promise<PlayGroupSession[]> =>
  listPlayGroupSessions(playGroupId),
);

/** Les jeux activés du groupe — la liste proposée à la création d'une session ou d'un contenu. */
export const readGroupGames = cache(async (playGroupId: string): Promise<Game[]> => {
  const group = await requirePlayGroup(playGroupId);
  if (!group.enabledGameIds || group.enabledGameIds.length === 0) {
    return [];
  }

  const games = await Promise.all(group.enabledGameIds.map((gameId) => readGameBySlugOrId(gameId)));

  return games.filter((game): game is Game => game !== null);
});

/**
 * Ce qui attend une réponse du membre : sondages non votés et sessions sans
 * réponse.
 *
 * C'est le chiffre de la pastille du rail et la phrase de l'en-tête de
 * l'Établi. Compté ici, une fois, plutôt que deux fois de deux manières.
 */
export function countPending(sessions: PlayGroupSession[], userId: string | null): number {
  if (!userId) {
    return 0;
  }

  return sessions.filter((session) => {
    if (session.status === "poll") {
      return !(session.slots ?? []).some((slot) => slot.voterIds.includes(userId));
    }

    return !session.rsvps.some((rsvp) => rsvp.userId === userId);
  }).length;
}
