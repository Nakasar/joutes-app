import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getWishlistAccess, getWishlistById, getWishlistItems } from "@/lib/db/wishlists";
import { getAllGames } from "@/lib/db/games";
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

  return {
    title: t("metadataTitleWishlist", { name: wishlist.name }),
    description: wishlist.description,
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

  const [initialItems, games] = await Promise.all([
    getWishlistItems(wishlistId, { page: 1, limit: 48, viewerId: session?.user?.id }),
    getAllGames(),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistDetailClient
        wishlist={wishlist}
        initialItems={initialItems}
        canEdit={canEdit}
        games={games}
        isLoggedIn={!!session?.user?.id}
      />
    </div>
  );
}
