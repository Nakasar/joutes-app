import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getWishlistsForOwner } from "@/lib/db/wishlists";
import WishlistsClient from "@/app/wishlists/WishlistsClient";
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
  const t = await getTranslations("Wishlists");
  const session = await auth.api.getSession({ headers: await headers() });
  const group = session?.user?.id ? await getPlayGroupByIdAndUser(playGroupId, session.user.id) : null;

  return {
    title: group ? t("metadataTitleGroup", { group: group.name }) : t("metadata.title"),
  };
}

export default async function PlayGroupWishlistsPage({
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

  const wishlists = await getWishlistsForOwner({ type: "playGroup", id: group.id });
  const tNav = await getTranslations("PlayGroups.page");
  const member = group.members.find((m) => m.userId === session.user.id);
  const canManageSettings = member?.role === "owner" || member?.role === "admin";

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="flex flex-row flex-wrap justify-between items-center gap-2 mb-4">
        <Button asChild variant="outline">
          <Link href="/play-groups">{tNav("back")}</Link>
        </Button>
        <PlayGroupToolsNavBar playGroupId={group.id} currentTab="wishlists" canManageSettings={canManageSettings} />
      </div>
      <WishlistsClient initialWishlists={wishlists} apiBasePath={`/api/play-groups/${group.id}/wishlists`} />
    </div>
  );
}
