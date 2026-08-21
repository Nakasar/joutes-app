import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { readPlayGroupPlaces } from "@/lib/db/play-group-sessions.ts";
import { getUserById } from "@/lib/db/users.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import PlayGroupGamesSettings from "@/components/play-groups/PlayGroupGamesSettings.tsx";

import PlayGroupIdentityForm from "./PlayGroupIdentityForm.tsx";
import PlayGroupVisibilityForm from "./PlayGroupVisibilityForm.tsx";
import { readPlayGroupVisibility } from "@/lib/play-groups/access.ts";

import { requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";

/**
 * Les réglages du groupe : sa personnalisation, puis ses jeux.
 *
 * Réservés au fondateur et aux admins — le rail ne montre l'entrée qu'à eux, et
 * la vue le vérifie de son côté : une URL partagée ne doit pas suffire.
 */
export default async function SettingsView({ playGroupId }: { playGroupId: string }) {
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

      <PlayGroupVisibilityForm playGroupId={group.id} visibility={readPlayGroupVisibility(group)} />

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
