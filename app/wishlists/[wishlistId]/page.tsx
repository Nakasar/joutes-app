import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getWishlistAccess, getWishlistById, getWishlistItems, getWishlistOwnerInfo } from "@/lib/db/wishlists";
import { getAllGames } from "@/lib/db/games";
import { getPlayGroupById, isGameEnabledForPlayGroup } from "@/lib/db/play-groups";
import WishlistDetailClient from "./WishlistDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wishlistId: string }>;
}): Promise<Metadata> {
  const { wishlistId } = await params;
  const t = await getTranslations("Wishlists");
  const wishlist = await getWishlistById(wishlistId);

  if (!wishlist) {
    return { title: t("metadata.notFoundTitle") };
  }

  const ownerInfo = await getWishlistOwnerInfo(wishlist);
  const description = ownerInfo
    ? `Liste de souhaits de ${ownerInfo.label}${wishlist.description ? ` - ${wishlist.description}` : ""}.`
    : wishlist.description;
  const title = t("metadataTitleWishlist", { name: wishlist.name });

  return {
    title,
    description,
    openGraph: { title: `${title} - Joutes`, description },
  };
}

export default async function WishlistDetailPage({
  params,
}: {
  params: Promise<{ wishlistId: string }>;
}) {
  const { wishlistId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    notFound();
  }

  const { canView, canEdit } = await getWishlistAccess(wishlist, session?.user?.id);
  if (!canView) {
    notFound();
  }

  const [initialItems, allGames, ownerInfo] = await Promise.all([
    getWishlistItems(wishlistId, { page: 1, limit: 48, viewerId: session?.user?.id }),
    getAllGames(),
    getWishlistOwnerInfo(wishlist),
  ]);

  let games = allGames;
  if (wishlist.ownerType === "playGroup") {
    const group = await getPlayGroupById(wishlist.ownerId);
    if (group?.enabledGameIds) {
      games = allGames.filter((game) => isGameEnabledForPlayGroup(group, game.id));
    }
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistDetailClient
        wishlist={wishlist}
        initialItems={initialItems}
        canEdit={canEdit}
        games={games}
        isLoggedIn={!!session?.user?.id}
        ownerInfo={ownerInfo}
      />
    </div>
  );
}
