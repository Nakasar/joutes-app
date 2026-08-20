import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";

import PlayGroupShell from "../../PlayGroupShell.tsx";
import ContentForm from "../ContentForm.tsx";
import { readGroupGames, requirePlayGroup, requirePlayGroupMember } from "../../group-data.ts";

type ContentParams = Promise<{ playGroupId: string; contentId: string }>;

export async function generateMetadata({ params }: { params: ContentParams }): Promise<Metadata> {
  const { playGroupId, contentId } = await params;
  const t = await getTranslations("PlayGroups.hub.contents");

  await connection();
  const group = await getPlayGroupById(playGroupId);
  const content = group?.options?.contents?.find((item) => item.id === contentId);

  return { title: content ? t("editMetadataTitle", { title: content.title }) : t("title") };
}

/**
 * La reprise d'un contenu.
 *
 * L'écran est le même qu'à la création : un contenu se relit et se corrige de
 * la même manière qu'il s'écrit. Seul le bouton de suppression s'ajoute, et
 * seulement pour qui peut supprimer.
 */
export default function EditPlayGroupContentPage({ params }: { params: ContentParams }) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 lg:px-8">
          <EditorFormSkeleton fields={5} label="Chargement de l'éditeur" />
        </div>
      }
    >
      <EditContentView params={params} />
    </Suspense>
  );
}

async function EditContentView({ params }: { params: ContentParams }) {
  const { playGroupId, contentId } = await params;

  return (
    <PlayGroupShell playGroupId={playGroupId} active="contents">
      <EditContent playGroupId={playGroupId} contentId={contentId} />
    </PlayGroupShell>
  );
}

async function EditContent({ playGroupId, contentId }: { playGroupId: string; contentId: string }) {
  const [group, viewer, games, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupGames(playGroupId),
    getTranslations("PlayGroups.hub.contents"),
  ]);

  const content = group.options?.contents?.find((item) => item.id === contentId);
  if (!content) {
    notFound();
  }

  // On ne reprend que ce qu'on a écrit — sauf à être admin, qui répond de tout
  // ce que le groupe publie.
  if (!viewer.canManage && content.authorId !== viewer.userId) {
    notFound();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("edit")}</h1>
      <ContentForm
        playGroupId={playGroupId}
        games={games.map((game) => ({ id: game.id, name: game.name }))}
        content={content}
        canDelete
      />
    </div>
  );
}
