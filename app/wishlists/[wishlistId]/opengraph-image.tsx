import { buildOgImage, buildWishlistOgImage, WISHLIST_GRID_MAX_ITEMS, type WishlistOgItem } from "@/lib/og";
import { getWishlistById, getWishlistItems } from "@/lib/db/wishlists";

export const dynamic = "force-dynamic";

export const alt = "Liste de souhaits - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ wishlistId: string }> }) {
  const { wishlistId } = await params;
  const wishlist = await getWishlistById(wishlistId);

  // Une wishlist introuvable ou privée ne doit pas divulguer son contenu à un
  // crawler de réseau social non authentifié : on retombe sur le mockup générique.
  if (!wishlist || wishlist.visibility === "private") {
    return buildOgImage({
      title: "Liste de souhaits",
      subtitle: "Suivez les cartes recherchées par la communauté Joutes.",
      variant: "wishlists",
    });
  }

  const { items } = await getWishlistItems(wishlistId, { page: 1, limit: WISHLIST_GRID_MAX_ITEMS });
  const cardItems: WishlistOgItem[] = items
    .filter((item) => !!item.image)
    .map((item) => ({ name: item.name, image: item.image, quantity: item.quantity }));

  return buildWishlistOgImage({
    wishlistName: wishlist.name,
    totalCount: wishlist.itemsCount,
    items: cardItems,
  });
}
