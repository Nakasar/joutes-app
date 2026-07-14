import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getAllGames } from "@/lib/db/games";
import PlayGroupGamesSettings from "@/components/play-groups/PlayGroupGamesSettings";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;
  const t = await getTranslations("PlayGroups.settings");
  const session = await auth.api.getSession({ headers: await headers() });
  const group = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;

  return {
    title: group ? t("metadataTitle", { group: group.name }) : t("title"),
  };
}

export default async function PlayGroupSettingsPage({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}) {
  const { playGroupId } = await params;

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

  const games = await getAllGames();

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
