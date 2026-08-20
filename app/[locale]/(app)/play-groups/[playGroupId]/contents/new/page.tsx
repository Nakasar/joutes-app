import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";

import PlayGroupShell from "../../PlayGroupShell.tsx";
import ContentForm from "../ContentForm.tsx";
import { readGroupGames, requirePlayGroupMember } from "../../group-data.ts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;
  const t = await getTranslations("PlayGroups.hub.contents");

  await connection();
  const group = await getPlayGroupById(playGroupId);

  return { title: group ? t("createMetadataTitle", { group: group.name }) : t("create") };
}

/** L'écriture d'un nouveau contenu — ouverte à tous les membres. */
export default function NewPlayGroupContentPage({ params }: { params: Promise<{ playGroupId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 lg:px-8">
          <EditorFormSkeleton fields={5} label="Chargement de l'éditeur" />
        </div>
      }
    >
      <NewContentView params={params} />
    </Suspense>
  );
}

async function NewContentView({ params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;

  return (
    <PlayGroupShell playGroupId={playGroupId} active="contents">
      <NewContent playGroupId={playGroupId} />
    </PlayGroupShell>
  );
}

async function NewContent({ playGroupId }: { playGroupId: string }) {
  const [, games, t] = await Promise.all([
    requirePlayGroupMember(playGroupId),
    readGroupGames(playGroupId),
    getTranslations("PlayGroups.hub.contents"),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("create")}</h1>
      <ContentForm playGroupId={playGroupId} games={games.map((game) => ({ id: game.id, name: game.name }))} />
    </div>
  );
}
