import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { countDeckCommentsInSpace } from "@/lib/db/deck-comments.ts";
import { listPlayGroupDecks } from "@/lib/db/play-group-decks.ts";
import { groupSpace } from "@/lib/decks/comments.ts";
import { readPlayGroupAccent } from "@/lib/play-groups/theme.ts";

import PlayGroupRail from "./PlayGroupRail.tsx";
import { countPending, readGroupSessions, readGroupViewer, requirePlayGroup } from "./group-data.ts";
import type { PlayGroupView } from "./views.ts";

/**
 * La coquille commune aux vues du hub : l'accent du groupe, le rail, le plan
 * de travail.
 *
 * L'accent est posé ici et non plus haut parce que ses déclinaisons se
 * dérivent en CSS **sur l'élément qui le porte** : il n'existe pas d'échelon
 * supérieur où l'appliquer. Un groupe sans personnalisation retombe sur
 * `--primary`, et rien de la page ne change de forme pour autant.
 */
export default async function PlayGroupShell({
  playGroupId,
  active,
  children,
}: {
  playGroupId: string;
  active: PlayGroupView;
  children: ReactNode;
}) {
  const [group, viewer, sessions, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupViewer(playGroupId),
    readGroupSessions(playGroupId),
    getTranslations("PlayGroups.hub.rail"),
  ]);

  const unreadComments = await readUnreadComments(
    playGroupId,
    viewer.userId,
    group.members.find((member) => member.userId === viewer.userId)?.joinedAt,
  );
  const accent = readPlayGroupAccent(group);
  const roleLabel = viewer.role === "owner" ? t("roleOwner") : viewer.canManage ? t("roleAdmin") : t("roleMember");

  return (
    <div className="play-group-theme flex min-h-screen flex-col lg:flex-row" style={accent.style}>
      <PlayGroupRail
        playGroupId={playGroupId}
        groupName={group.name}
        logo={group.options?.theme?.logo}
        memberCount={group.members.length}
        pendingCount={countPending(sessions, viewer.userId)}
        unreadComments={unreadComments}
        canManage={viewer.canManage}
        active={active}
        roleLabel={roleLabel}
      />

      <div className="min-w-0 flex-1 px-4 pt-6 pb-11 lg:px-8">{children}</div>
    </div>
  );
}

/**
 * La pastille de « Decks » : les commentaires d'autrui non lus, sur les decks
 * encore dans la bibliothèque — le fil d'un deck retiré s'est refermé. Une
 * pastille ratée ne doit pas casser la page.
 */
async function readUnreadComments(playGroupId: string, userId: string | null, joinedAt?: string): Promise<number> {
  if (!userId) return 0;

  try {
    const [counts, links] = await Promise.all([
      countDeckCommentsInSpace(groupSpace(playGroupId), userId, joinedAt),
      listPlayGroupDecks(playGroupId),
    ]);

    return links.reduce((total, link) => total + (counts.get(link.deckId)?.unread ?? 0), 0);
  } catch (error) {
    console.error("Error counting unread deck comments:", error);
    return 0;
  }
}
