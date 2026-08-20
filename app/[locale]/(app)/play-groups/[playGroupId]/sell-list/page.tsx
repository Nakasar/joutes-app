import { Suspense } from "react";
import { PlayGroupCollectionSkeleton, PlayGroupToolsRowSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getPlayGroupById, getPlayGroupByIdAndUser } from "@/lib/db/play-groups.ts";
import { getOrCreateSellListForOwner, getSellListForOwner, getSellListItems, getSellListOwnerInfo } from "@/lib/db/sell-lists.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import SellListDetailClient from "@/app/[locale]/(app)/sell-lists/SellListDetailClient.tsx";
import { PlayGroupToolsNavBar } from "@/components/play-groups/PlayGroupToolsNavBar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";


async function PlayGroupSellListPageContent({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}) {
  const { playGroupId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const membershipGroup = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;
  const isMember = !!membershipGroup;
  const member = membershipGroup?.members.find((m) => m.userId === session!.user.id);
  const canManageSettings = member?.role === "owner" || member?.role === "admin";

  let sellList = await getSellListForOwner({ type: "playGroup", id: group.id });
  if (!sellList && isMember) {
    // Members land on an editable empty list right away instead of a dead end.
    sellList = await getOrCreateSellListForOwner({ type: "playGroup", id: group.id });
  }

  if (!sellList) {
    const t = await getTranslations("SellLists");
    return (
      <div className="container mx-auto max-w-2xl p-4 sm:p-6">
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">{t("empty.groupDescription")}</CardContent>
        </Card>
      </div>
    );
  }

  const [initialItems, ownerInfo, locale] = await Promise.all([
    getSellListItems(sellList.id, { page: 1, limit: 48 }),
    getSellListOwnerInfo(sellList),
    getLocale(),
  ]);

  const tNav = await getTranslations("PlayGroups.page");

  return (
    <div className="container mx-auto p-4 sm:p-6">
      {isMember && (
        <div className="flex flex-row flex-wrap justify-between items-center gap-2 mb-4">
          <Button asChild variant="outline">
            <Link href="/play-groups">{tNav("back")}</Link>
          </Button>
          <PlayGroupToolsNavBar playGroupId={group.id} currentTab="sellList" canManageSettings={canManageSettings} />
        </div>
      )}
      <SellListDetailClient
        sellList={sellList}
        initialItems={initialItems}
        canEdit={isMember}
        ownerInfo={ownerInfo}
        locale={locale}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte : il faut être membre du groupe. La
 * coquille ne garde donc que le conteneur et la silhouette — le nom du groupe
 * lui-même n'a pas à s'afficher avant que la porte ait répondu.
 */
export default function PlayGroupSellListPage(props: Parameters<typeof PlayGroupSellListPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <PlayGroupToolsRowSkeleton />
          <PlayGroupCollectionSkeleton tiles={6} label="Chargement de la liste de vente" />
        </div>
      }
    >
      <PlayGroupSellListPageContent {...props} />
    </Suspense>
  );
}
