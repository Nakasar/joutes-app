import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getCollectionOverview } from "@/lib/db/collection";
import CollectionOverview from "@/app/collection/CollectionOverview";
import { PlayGroupToolsNavBar } from "@/components/play-groups/PlayGroupToolsNavBar";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;
  const t = await getTranslations("PlayGroups.collection");
  const session = await auth.api.getSession({ headers: await headers() });
  const group = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;

  return {
    title: group ? t("metadataTitle", { group: group.name }) : t("title"),
  };
}

export default async function PlayGroupCollectionPage({
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

  const t = await getTranslations("PlayGroups.collection");
  const tNav = await getTranslations("PlayGroups.page");
  const member = group.members.find((m) => m.userId === session.user.id);
  const canManageSettings = member?.role === "owner" || member?.role === "admin";

  const overview = await getCollectionOverview({ type: "playGroup", id: group.id }, { allowedGameIds: group.enabledGameIds });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="flex flex-row flex-wrap justify-between items-center gap-2 mb-4">
        <Button asChild variant="outline">
          <Link href="/play-groups">{tNav("back")}</Link>
        </Button>
        <PlayGroupToolsNavBar playGroupId={group.id} currentTab="collection" canManageSettings={canManageSettings} />
      </div>
      <CollectionOverview
        initialOverview={overview}
        basePath={`/play-groups/${group.id}/collection`}
        apiBasePath={`/api/play-groups/${group.id}/collection`}
        title={t("title", { group: group.name })}
        subtitle={t("subtitle")}
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
      />
    </div>
  );
}
