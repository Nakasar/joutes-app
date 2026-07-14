import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getWishlistsForOwner } from "@/lib/db/wishlists";
import WishlistsClient from "@/app/wishlists/WishlistsClient";

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

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistsClient initialWishlists={wishlists} apiBasePath={`/api/play-groups/${group.id}/wishlists`} />
    </div>
  );
}
