import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getPlayGroupById, getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getOrCreateSellListForOwner, getSellListForOwner, getSellListItems, getSellListOwnerInfo } from "@/lib/db/sell-lists";
import { Card, CardContent } from "@/components/ui/card";
import SellListDetailClient from "@/app/sell-lists/SellListDetailClient";
import { PlayGroupToolsNavBar } from "@/components/play-groups/PlayGroupToolsNavBar";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PlayGroupSellListPage({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}) {
  const { playGroupId } = await params;

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
