import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import PlayGroupGamesSettings from "@/components/play-groups/PlayGroupGamesSettings.tsx";


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
  const session = await auth.api.getSession({ headers: await headers() });
  const group = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;

  return {
    title: group ? t("metadataTitle", { group: group.name }) : t("title"),
  };
}

async function PlayGroupSettingsPageContent({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}) {
  const { playGroupId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    notFound();
  }

  const member = group.members.find((m) => m.userId === session.user.id);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    redirect(`/play-groups/${group.id}`);
  }

  const games = await readAllGames();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <PlayGroupGamesSettings
        playGroupId={group.id}
        groupName={group.name}
        games={games
          .map((g) => ({ id: g.id, name: g.name, slug: g.slug }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        initialEnabledGameIds={group.enabledGameIds ?? null}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte : il faut être membre du groupe. La
 * coquille ne garde donc que le conteneur et la silhouette — le nom du groupe
 * lui-même n'a pas à s'afficher avant que la porte ait répondu.
 */
export default function PlayGroupSettingsPage(props: Parameters<typeof PlayGroupSettingsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-3xl px-4 py-8">
          <EditorFormSkeleton fields={3} label="Chargement des réglages" />
        </div>
      }
    >
      <PlayGroupSettingsPageContent {...props} />
    </Suspense>
  );
}
