import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import ContentForm from "./ContentForm.tsx";
import { readGroupGames, requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";

/**
 * L'écriture d'un contenu, à la création comme à la reprise.
 *
 * Un seul écran pour les deux : un contenu se relit et se corrige de la même
 * manière qu'il s'écrit. Seul le bouton de suppression s'ajoute quand il y a
 * quelque chose à supprimer.
 *
 * `contentId` absent — ou valant `new` — ouvre un contenu vierge. On ne reprend
 * que ce qu'on a écrit, sauf à être admin : c'est lui qui répond de tout ce que
 * le groupe publie.
 */
export default async function ContentEditorView({
  playGroupId,
  contentId,
}: {
  playGroupId: string;
  contentId?: string;
}) {
  const [group, viewer, games, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupGames(playGroupId),
    getTranslations("PlayGroups.hub.contents"),
  ]);

  const isNew = !contentId || contentId === "new";
  const content = isNew ? undefined : group.options?.contents?.find((item) => item.id === contentId);

  if (!isNew) {
    if (!content) {
      notFound();
    }

    if (!viewer.canManage && content.authorId !== viewer.userId) {
      notFound();
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t(isNew ? "create" : "edit")}</h1>
      <ContentForm
        playGroupId={playGroupId}
        games={games.map((game) => ({ id: game.id, name: game.name }))}
        content={content}
        canDelete={!isNew}
      />
    </div>
  );
}
