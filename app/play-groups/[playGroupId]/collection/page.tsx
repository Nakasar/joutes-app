import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getCollectionOverview } from "@/lib/db/collection";
import CollectionOverview from "@/app/collection/CollectionOverview";

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

  const overview = await getCollectionOverview({ type: "playGroup", id: group.id });

  return (
    <div className="container mx-auto p-4 sm:p-6">
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
