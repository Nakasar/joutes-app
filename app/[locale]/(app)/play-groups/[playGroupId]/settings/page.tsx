import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { readPlayGroupPlaces } from "@/lib/db/play-group-sessions.ts";
import { getUserById } from "@/lib/db/users.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import PlayGroupGamesSettings from "@/components/play-groups/PlayGroupGamesSettings.tsx";

import PlayGroupShell from "../PlayGroupShell.tsx";
import PlayGroupIdentityForm from "./PlayGroupIdentityForm.tsx";
import { requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();
  const t = await getTranslations("PlayGroups.settings");
  const group = await getPlayGroupById(playGroupId);

  return { title: group ? t("metadataTitle", { group: group.name }) : t("title") };
}

/**
 * Les réglages du groupe : sa personnalisation, puis ses jeux.
 *
 * Réservés au fondateur et aux admins — le rail ne montre l'entrée qu'à eux, et
 * la page le vérifie de son côté : un lien partagé ne doit pas suffire.
 */
export default function PlayGroupSettingsPage({ params }: { params: Promise<{ playGroupId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 lg:px-8">
          <EditorFormSkeleton fields={5} label="Chargement des réglages" />
        </div>
      }
    >
      <SettingsView params={params} />
    </Suspense>
  );
}

async function SettingsView({ params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;

  return (
    <PlayGroupShell playGroupId={playGroupId} active="settings">
      <SettingsContent playGroupId={playGroupId} />
    </PlayGroupShell>
  );
}

async function SettingsContent({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    getTranslations("PlayGroups.hub.settings"),
  ]);

  if (!viewer.canManage) {
    notFound();
  }

  const [games, places, user] = await Promise.all([
    readAllGames(),
    readPlayGroupPlaces(playGroupId),
    viewer.userId ? getUserById(viewer.userId) : null,
  ]);

  const lairIds = [
    ...new Set(
      [
        group.options?.rhythm?.defaultPlace?.lairId,
        ...places.filter((entry) => entry.place.kind === "joutes").map((entry) => entry.place.lairId),
        ...(user?.lairs ?? []),
      ].filter((id): id is string => !!id),
    ),
  ];

  const lairs = await getLairsByIds(lairIds);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <PlayGroupIdentityForm
        group={group}
        lairs={lairs.map((lair) => ({ id: lair.id, name: lair.name }))}
      />

      <PlayGroupGamesSettings
        playGroupId={group.id}
        groupName={group.name}
        games={games
          .map((game) => ({ id: game.id, name: game.name, slug: game.slug }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        initialEnabledGameIds={group.enabledGameIds ?? null}
      />
    </div>
  );
}
