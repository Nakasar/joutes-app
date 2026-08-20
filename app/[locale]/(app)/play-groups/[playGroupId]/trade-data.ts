import "server-only";

import { cache } from "react";

import { getWishlistItems, getWishlistsForOwner } from "@/lib/db/wishlists.ts";
import { getSellListForOwner, getSellListItems } from "@/lib/db/sell-lists.ts";
import { matchWishesToOffers, type TradeMatch } from "@/lib/play-groups/trade-matches.ts";

/** Ce qu'on lit de chaque liste pour le rapprochement — assez pour nommer une carte, pas plus. */
const TRADE_SCAN_LIMIT = 200;

/**
 * Les échanges possibles dans le groupe.
 *
 * Le rapprochement se fait en mémoire, sur un échantillon borné des deux
 * listes : une jointure en base sur les identifiants de cartes coûterait plus
 * cher que de comparer deux cents lignes, et le bloc n'en montre de toute façon
 * qu'une poignée.
 */
export const readGroupTradeMatches = cache(async (playGroupId: string): Promise<TradeMatch[]> => {
  const owner = { type: "playGroup" as const, id: playGroupId };

  const [wishlists, sellList] = await Promise.all([
    getWishlistsForOwner(owner),
    getSellListForOwner(owner),
  ]);

  if (wishlists.length === 0 || !sellList) {
    return [];
  }

  const [wishPages, offers] = await Promise.all([
    Promise.all(wishlists.map((wishlist) => getWishlistItems(wishlist.id, { limit: TRADE_SCAN_LIMIT }))),
    getSellListItems(sellList.id, { limit: TRADE_SCAN_LIMIT }),
  ]);

  return matchWishesToOffers(
    wishPages.flatMap((page) =>
      page.items.map((item) => ({
        cardId: item.cardId,
        name: item.name,
        gameName: item.gameName,
        image: item.image,
        addedByUserId: item.addedByUserId,
      })),
    ),
    offers.items.map((item) => ({
      cardId: item.cardId,
      addedByUserId: item.addedByUserId,
      price: item.price,
      currency: item.currency,
    })),
  );
});
